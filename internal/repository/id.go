package repository

import (
	"crypto/rand"
	"encoding/hex"
)

func randomHex(nBytes int) string {
	b := make([]byte, nBytes)
	// Never fails on modern OSes; fall through with zeros on the impossible error.
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
