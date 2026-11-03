// Command loadtest generates webhook load against a running engine
// (PRD §35): configurable events, endpoints, workers, and reports
// throughput / p50/p95/p99 ingest latency and final /v1/stats snapshot.
//
// It now ships with a built-in subscriber sink so a single command gives
// end-to-end numbers:
//
//	go run ./cmd/loadtest -url http://localhost:8080 -token $JWT \
//	  -sink-port 9000 -events 10000 -endpoints 100
//
// Benchmarks must be executed against a live environment and documented
// honestly — this tooling makes that possible; the numbers go in
// docs/performance.md only when actually measured.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	endpoint := flag.String("url", "http://localhost:8080", "engine base URL")
	token := flag.String("token", "", "JWT (required)")
	target := flag.String("target", "http://127.0.0.1:9000/hook", "subscriber URL registered as endpoints")
	events := flag.Int("events", 10000, "total events")
	eps := flag.Int("endpoints", 100, "number of endpoints to register")
	concurrency := flag.Int("concurrency", 20, "ingest goroutines")
	sinkPort := flag.Int("sink-port", 0, "if >0, start a built-in subscriber sink on this port")
	sinkStatus := flag.Int("sink-status", 200, "status code the built-in sink returns")
	drainTimeout := flag.Duration("drain-timeout", 5*time.Minute, "max wait for the queue to drain")
	flag.Parse()

	if *token == "" {
		fmt.Fprintln(os.Stderr, "-token is required")
		os.Exit(1)
	}

	var sinkHits atomic.Int64
	if *sinkPort > 0 {
		srv := &http.Server{Addr: fmt.Sprintf(":%d", *sinkPort)}
		mux := http.NewServeMux()
		mux.HandleFunc("/hook", func(w http.ResponseWriter, r *http.Request) {
			sinkHits.Add(1)
			_, _ = io.Copy(io.Discard, r.Body)
			w.WriteHeader(*sinkStatus)
		})
		srv.Handler = mux
		go func() {
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				fmt.Fprintf(os.Stderr, "sink failed: %v\n", err)
			}
		}()
		fmt.Printf("built-in sink listening on :%d returning %d\n", *sinkPort, *sinkStatus)
		// wait for sink to be ready
		time.Sleep(200 * time.Millisecond)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	auth := "Bearer " + *token

	// 1. register endpoints
	start := time.Now()
	installed := 0
	for i := 0; i < *eps; i++ {
		body := fmt.Sprintf(`{"name":"load-ep-%d","url":"%s?ep=%d"}`, i, *target, i)
		if status := post(client, auth, *endpoint+"/v1/endpoints", body); status >= 200 && status < 300 {
			installed++
		}
	}
	fmt.Printf("registered %d/%d endpoints in %v\n", installed, *eps, time.Since(start))

	// 2. ingest events concurrently
	latencies := make([]int64, 0, *events)
	var mu sync.Mutex
	var accepted, replayed, failed atomic.Int64
	ingestStart := time.Now()

	sem := make(chan struct{}, *concurrency)
	var wg sync.WaitGroup
	for i := 0; i < *events; i++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int) {
			defer wg.Done()
			defer func() { <-sem }()
			body := fmt.Sprintf(`{"event_type":"load.test","payload":{"i":%d}}`, i)
			key := fmt.Sprintf("load-%d", i)
			req, _ := http.NewRequest(http.MethodPost, *endpoint+"/v1/events", bytes.NewReader([]byte(body)))
			req.Header.Set("Authorization", auth)
			req.Header.Set("Idempotency-Key", key)
			req.Header.Set("Content-Type", "application/json")
			at := time.Now()
			resp, err := client.Do(req)
			took := time.Since(at)
			if err != nil {
				failed.Add(1)
				return
			}
			defer resp.Body.Close()
			_, _ = io.Copy(io.Discard, resp.Body)
			mu.Lock()
			latencies = append(latencies, took.Milliseconds())
			mu.Unlock()
			switch resp.StatusCode {
			case 201:
				accepted.Add(1)
			case 200:
				replayed.Add(1)
			default:
				failed.Add(1)
			}
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(ingestStart)

	fmt.Printf("ingested %d accepted, %d duplicate, %d failed in %v (%.0f ev/s)\n",
		accepted.Load(), replayed.Load(), failed.Load(), elapsed,
		float64(accepted.Load()+replayed.Load())/elapsed.Seconds())
	if len(latencies) > 0 {
		printPercentiles("ingest latency", latencies)
	}

	// 3. drain: poll /v1/stats until queue_depth == 0 or timeout
	drainStart := time.Now()
	fmt.Printf("waiting for queue to drain (timeout %v)...\n", *drainTimeout)
	for time.Since(drainStart) < *drainTimeout {
		resp, _ := get(client, auth, *endpoint+"/v1/stats")
		var s map[string]any
		_ = json.Unmarshal([]byte(resp), &s)
		qd, _ := s["queue_depth"].(float64)
		if qd == 0 {
			drainElapsed := time.Since(drainStart)
			totalDeliveries := *events * installed
			fmt.Printf("drained in %v (sink received %d requests; delivery throughput %.0f deliveries/s)\n",
				drainElapsed, sinkHits.Load(),
				float64(totalDeliveries)/drainElapsed.Seconds())
			fmt.Printf("final stats: %s\n", resp)
			break
		}
		time.Sleep(250 * time.Millisecond)
	}
}

func printPercentiles(label string, values []int64) {
	sorted := append([]int64(nil), values...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	pick := func(p float64) int64 {
		idx := int(p * float64(len(sorted)-1))
		return sorted[idx]
	}
	fmt.Printf("%s p50=%dms p95=%dms p99=%dms max=%dms\n",
		label, pick(0.50), pick(0.95), pick(0.99), sorted[len(sorted)-1])
}

func post(client *http.Client, auth, url, body string) int {
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader([]byte(body)))
	if err != nil {
		return 0
	}
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode
}

func get(client *http.Client, auth, url string) (string, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", auth)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return string(b), err
}
