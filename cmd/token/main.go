// Command token issues a JWT for the hookfire API (demo/dev helper).
// Tokens are minted with the same JWT_SECRET the server validates with.
//
//	go run ./cmd/token -secret "$JWT_SECRET" -sub demo -exp 12h
package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"hookfire/internal/middleware"
)

func main() {
	secret := flag.String("secret", os.Getenv("JWT_SECRET"), "JWT_SECRET (or set env)")
	subject := flag.String("sub", "demo", "token subject")
	exp := flag.String("exp", "12h", "token lifetime")
	flag.Parse()

	if *secret == "" {
		fmt.Fprintln(os.Stderr, "secret required: pass -secret or set JWT_SECRET")
		os.Exit(1)
	}
	ttl, err := time.ParseDuration(*exp)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid -exp: %v\n", err)
		os.Exit(1)
	}
	token, err := middleware.IssueToken(*secret, *subject, ttl)
	if err != nil {
		fmt.Fprintf(os.Stderr, "issue token: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(token)
}
