package middleware

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// IssueToken mints an API token for demo/tooling use (cmd/token). The server
// itself never issues tokens over HTTP — tokens come from the operator
// (PRD §22).
func IssueToken(secret, subject string, ttl time.Duration) (string, error) {
	if subject == "" {
		subject = "api-client"
	}
	claims := jwt.MapClaims{
		"sub": subject,
		"iss": "hookfire",
		"iat": time.Now().UTC().Unix(),
		"exp": time.Now().UTC().Add(ttl).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}
