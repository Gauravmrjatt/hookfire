// Package metrics defines the Prometheus instrumentation (PRD §24).
// Labels are kept deliberately low-cardinality: endpoint IDs and outcome
// enums only — never event IDs, request IDs, URLs or payloads.
package metrics

import (
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Metrics is the shared instrument set.
type Metrics struct {
	EventsTotal            *prometheus.CounterVec   // outcome
	DeliveriesTotal        *prometheus.CounterVec   // status transition
	DeliveryFailuresTotal  *prometheus.CounterVec   // endpoint_id
	DeliveryRetriesTotal   *prometheus.CounterVec   // endpoint_id
	DeliveryLatencySeconds *prometheus.HistogramVec // endpoint_id
	QueueDepth             prometheus.Gauge
	DeadLetterTotal        prometheus.Counter
	ActiveWorkers          prometheus.Gauge
}

// New returns the process-wide instrument set.
//
// Collectors may be registered on the default Prometheus registry exactly once
// per process, and promauto panics on a duplicate name. Anything that builds
// more than one engine in a single process (an integration-test harness, for
// example) used to panic with "duplicate metrics collector registration
// attempted" on the second call, so the set is created once and shared.
func New() *Metrics {
	defaultOnce.Do(func() { defaultMetrics = newMetrics() })
	return defaultMetrics
}

var (
	defaultOnce    sync.Once
	defaultMetrics *Metrics
)

func newMetrics() *Metrics {
	return &Metrics{
		EventsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "webhook_events_total",
			Help: "Ingested webhook events.",
		}, []string{"outcome"}),
		DeliveriesTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "webhook_deliveries_total",
			Help: "Delivery state transitions.",
		}, []string{"status"}),
		DeliveryFailuresTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "webhook_delivery_failures_total",
			Help: "Deliveries that ended in a terminal failure.",
		}, []string{"endpoint_id"}),
		DeliveryRetriesTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "webhook_delivery_retries_total",
			Help: "Scheduled delivery retries.",
		}, []string{"endpoint_id"}),
		DeliveryLatencySeconds: promauto.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "webhook_delivery_latency_seconds",
			Help:    "Outbound webhook HTTP attempt latency.",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		}, []string{"endpoint_id"}),
		QueueDepth: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "webhook_queue_depth",
			Help: "Deliveries queued in memory, unclaimed.",
		}),
		DeadLetterTotal: promauto.NewCounter(prometheus.CounterOpts{
			Name: "webhook_dead_letter_total",
			Help: "Deliveries moved to the dead-letter queue.",
		}),
		ActiveWorkers: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "webhook_active_workers",
			Help: "Workers currently processing a delivery.",
		}),
	}
}
