package service

import (
	"fmt"

	"hookfire/internal/model"
)

// Page is the pagination envelope shared by the dashboard feed endpoints.
type Page[T any] struct {
	Items  []T `json:"items"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

// MaxFeedLimit bounds every feed request so a dashboard bug cannot ask for a
// full table scan in one page.
const MaxFeedLimit = 200

func normalizePage(limit, offset int) (int, int, error) {
	if limit <= 0 {
		limit = 25
	}
	if limit > MaxFeedLimit {
		return 0, 0, fmt.Errorf("%w: limit must be <= %d", ErrValidation, MaxFeedLimit)
	}
	if offset < 0 {
		return 0, 0, fmt.Errorf("%w: offset must be >= 0", ErrValidation)
	}
	return limit, offset, nil
}

func validStatus(s string) bool {
	for _, v := range model.DeliveryStatuses {
		if v == s {
			return true
		}
	}
	return false
}
