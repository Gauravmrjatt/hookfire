package middleware

import (
	"net/http"
	"strings"
)

// CORS lets the operator dashboard (served from a different origin in
// development, e.g. http://localhost:5173) call the API. Origins are an
// explicit allowlist; "*" is supported for throwaway local setups and must
// never be used in production (PRD §31).
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	wildcard := false
	for _, o := range allowedOrigins {
		switch o = strings.TrimSpace(o); o {
		case "":
			continue
		case "*":
			wildcard = true
		default:
			allowed[o] = struct{}{}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			_, ok := allowed[origin]
			if origin != "" && (ok || wildcard) {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				h.Add("Vary", "Origin")
				h.Set("Access-Control-Allow-Credentials", "true")
				h.Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
				h.Set("Access-Control-Max-Age", "600")
			}
			// Preflight: answer here so the method-pattern mux never sees OPTIONS.
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
