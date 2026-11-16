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
	dupKeys := flag.Int("dup-keys", 0, "if >0, run only a concurrent duplicate-ingest test with this many keys")
	dupCopies := flag.Int("dup-copies", 10, "concurrent copies of each duplicate-test key")
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

	if *dupKeys > 0 {
		runDuplicateTest(client, auth, *endpoint, *dupKeys, *dupCopies, installed)
		return
	}

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
			latencies = append(latencies, took.Microseconds())
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

	// 3. drain: an empty queue is not enough — workers hold in-flight jobs, so
	// also wait until every expected delivery has reached a terminal state.
	expected := int64(accepted.Load()) * int64(installed)
	drainStart := time.Now()
	fmt.Printf("waiting for %d deliveries to finish (timeout %v)...\n", expected, *drainTimeout)
	completed := false
	var resp string
	lastProgress := time.Time{}
	var pollErr string
	for time.Since(drainStart) < *drainTimeout {
		body, err := get(client, auth, *endpoint+"/v1/stats")
		if err != nil {
			pollErr = err.Error()
			time.Sleep(250 * time.Millisecond)
			continue
		}
		resp = body
		var s map[string]any
		if err := json.Unmarshal([]byte(body), &s); err != nil {
			pollErr = "stats decode: " + err.Error()
			time.Sleep(250 * time.Millisecond)
			continue
		}
		if e, ok := s["error"].(map[string]any); ok {
			// A bad token or a server error must fail loudly, not silently
			// poll until the timeout.
			fmt.Printf("ERROR: stats poll rejected: %v\n", e)
			return
		}
		qd, _ := s["queue_depth"].(float64)
		terminal, _ := s["deliveries_total"].(float64)
		if qd == 0 && int64(terminal) >= expected {
			completed = true
			break
		}
		if time.Since(lastProgress) >= 10*time.Second {
			lastProgress = time.Now()
			fmt.Printf("  progress: %d/%d terminal, %d sink hits, queue_depth=%d\n",
				int64(terminal), expected, sinkHits.Load(), int(qd))
		}
		time.Sleep(250 * time.Millisecond)
	}
	if pollErr != "" {
		fmt.Printf("  last stats poll error: %s\n", pollErr)
	}
	drainElapsed := time.Since(drainStart)
	fmt.Printf("drained in %v (sink received %d/%d requests; delivery throughput %.0f deliveries/s)\n",
		drainElapsed, sinkHits.Load(), expected,
		float64(sinkHits.Load())/drainElapsed.Seconds())
	fmt.Printf("final stats: %s\n", resp)
	if !completed {
		fmt.Printf("ERROR: drain timed out after %v (%d/%d deliveries terminal)\n",
			*drainTimeout, sinkHits.Load(), expected)
	}
}

// runDuplicateTest fires copies concurrent requests per idempotency key and
// verifies that each key produced exactly one event and exactly one fan-out
// delivery per active endpoint (PRD §13 at-least-once + idempotent ingest).
func runDuplicateTest(client *http.Client, auth, base string, keys, copies, endpoints int) {
	var created, replayed, failed atomic.Int64
	eventIDs := make([]string, keys)
	createsPerKey := make([]int32, keys)
	var mu sync.Mutex

	start := time.Now()
	sem := make(chan struct{}, copies*4)
	var wg sync.WaitGroup
	for i := 0; i < keys; i++ {
		body := fmt.Sprintf(`{"event_type":"dup.test","payload":{"key":%d}}`, i)
		key := fmt.Sprintf("dup-%d", i)
		for c := 0; c < copies; c++ {
			wg.Add(1)
			sem <- struct{}{}
			go func(i int) {
				defer wg.Done()
				defer func() { <-sem }()
				req, err := http.NewRequest(http.MethodPost, base+"/v1/events", bytes.NewReader([]byte(body)))
				if err != nil {
					failed.Add(1)
					return
				}
				req.Header.Set("Authorization", auth)
				req.Header.Set("Idempotency-Key", key)
				req.Header.Set("Content-Type", "application/json")
				resp, err := client.Do(req)
				if err != nil {
					failed.Add(1)
					return
				}
				defer resp.Body.Close()
				var ev struct {
					ID string `json:"id"`
				}
				_ = json.NewDecoder(resp.Body).Decode(&ev)
				switch resp.StatusCode {
				case http.StatusCreated:
					created.Add(1)
					mu.Lock()
					createsPerKey[i]++
					if ev.ID != "" {
						eventIDs[i] = ev.ID
					}
					mu.Unlock()
				case http.StatusOK:
					replayed.Add(1)
				default:
					failed.Add(1)
				}
			}(i)
		}
	}
	wg.Wait()
	elapsed := time.Since(start)

	multiple := 0
	for _, n := range createsPerKey {
		if n > 1 {
			multiple++
		}
	}

	over, under, checked, missing := 0, 0, 0, 0
	for _, id := range eventIDs {
		if id == "" {
			missing++
			continue
		}
		raw, err := get(client, auth, base+"/v1/events/"+id+"/deliveries")
		if err != nil {
			missing++
			continue
		}
		var payload struct {
			Deliveries []json.RawMessage `json:"deliveries"`
		}
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			missing++
			continue
		}
		checked++
		if len(payload.Deliveries) > endpoints {
			over++
		} else if len(payload.Deliveries) < endpoints {
			under++
		}
	}

	fmt.Printf("duplicate ingest: %d keys x %d concurrent copies in %v\n", keys, copies, elapsed)
	fmt.Printf("  responses: %d created (201), %d replayed (200), %d failed\n",
		created.Load(), replayed.Load(), failed.Load())
	fmt.Printf("  keys that created more than one event: %d\n", multiple)
	fmt.Printf("  fan-out checked on %d events: %d with >%d deliveries, %d with <%d, %d unreadable\n",
		checked, over, endpoints, under, endpoints, missing)

	if multiple == 0 && over == 0 && under == 0 && failed.Load() == 0 && missing == 0 &&
		created.Load() == int64(keys) && replayed.Load() == int64(keys*(copies-1)) {
		fmt.Println("RESULT: PASS — one event per key, one delivery per endpoint, 0 duplicate deliveries")
		return
	}
	fmt.Println("RESULT: FAIL — inspect the counts above")
}

func printPercentiles(label string, values []int64) {
	sorted := append([]int64(nil), values...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	pick := func(p float64) int64 {
		idx := int(p * float64(len(sorted)-1))
		return sorted[idx]
	}
	ms := func(v int64) float64 { return float64(v) / 1000 }
	fmt.Printf("%s p50=%.2fms p95=%.2fms p99=%.2fms max=%.2fms\n",
		label, ms(pick(0.50)), ms(pick(0.95)), ms(pick(0.99)), ms(sorted[len(sorted)-1]))
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
