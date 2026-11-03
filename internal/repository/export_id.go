package repository

// NewID builds a prefixed opaque identifier: NewID("ep") -> "ep_<hex>".
func NewID(prefix string) string { return prefix + "_" + randomHex(16) }

// RandomHex returns 2*nBytes random hex characters. Used for endpoint secrets.
func RandomHex(nBytes int) string { return randomHex(nBytes) }
