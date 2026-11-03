package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// claimsKey stores authenticated claims in request contexts.
type claimsKey struct{}

// Claims is the JWT payload accepted by the API (PRD §22).
// Claims is the JWT payload accepted by the API (PRD §22).
type Claims struct {
	Subject string
	// Raw is the full claim set for future scoping (e.g. endpoint ownership).
	Raw jwt.MapClaims
}

// FromContext returns authenticated claims, or nil for public endpoints.
func FromContext(ctx context.Context) *Claims {
	c, _ := ctx.Value(claimsKey{}).(*Claims)
	return c
}

// JWTAuth enforces Bearer JWT (HS256) authentication on wrapped handlers.
// Public endpoints are registered outside of it (PRD §22).
type JWTAuth struct {
	secret []byte
}

func NewJWTAuth(secret string) *JWTAuth { return &JWTAuth{secret: []byte(secret)} }

func (a *JWTAuth) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			writeUnauthorized(w, "missing Authorization header")
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		if token == "" || token == header {
			writeUnauthorized(w, "Authorization header must be a Bearer token")
			return
		}

		parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
			}
			return a.secret, nil
		}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
		if err != nil || !parsed.Valid {
			writeUnauthorized(w, "invalid or expired token")
			return
		}

		claims, ok := parsed.Claims.(jwt.MapClaims)
		if !ok {
			writeUnauthorized(w, "invalid token claims")
			return
		}
		subject, _ := claims["sub"].(string)

		next.ServeHTTP(w, r.WithContext(
			context.WithValue(r.Context(), claimsKey{}, &Claims{Subject: subject, Raw: claims})))
	})
}

func writeUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":{"code":"UNAUTHORIZED","message":` +
		jsonString(message) + `}}`))
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
