package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func handler200(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }

func TestIssueAndValidate(t *testing.T) {
	token, err := IssueToken("secret-x", "demo", time.Hour)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	auth := NewJWTAuth("secret-x")
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/events", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	auth.Wrap(http.HandlerFunc(handler200)).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("valid token rejected: %d", rr.Code)
	}
}

func TestJWTRejectsMissingHeader(t *testing.T) {
	auth := NewJWTAuth("secret-x")
	rr := httptest.NewRecorder()
	auth.Wrap(http.HandlerFunc(handler200)).ServeHTTP(rr, httptest.NewRequest("GET", "/", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("missing header: %d, want 401", rr.Code)
	}
}

func TestJWTRejectsBadSignature(t *testing.T) {
	token, _ := IssueToken("secret-other", "demo", time.Hour)
	auth := NewJWTAuth("secret-x")
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	auth.Wrap(http.HandlerFunc(handler200)).ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("wrong-secret token: %d, want 401", rr.Code)
	}
}

func TestJWTRejectsExpired(t *testing.T) {
	token, _ := IssueToken("secret-x", "demo", -time.Minute)
	auth := NewJWTAuth("secret-x")
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	auth.Wrap(http.HandlerFunc(handler200)).ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expired token: %d, want 401", rr.Code)
	}
}

func TestJWTRejectsNonBearer(t *testing.T) {
	token, _ := IssueToken("secret-x", "demo", time.Hour)
	auth := NewJWTAuth("secret-x")
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Basic "+token)
	auth.Wrap(http.HandlerFunc(handler200)).ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("non-bearer token: %d, want 401", rr.Code)
	}
}

func TestJWTClaimsInContext(t *testing.T) {
	token, _ := IssueToken("secret-x", "webhook-client", time.Hour)
	auth := NewJWTAuth("secret-x")
	var gotSubject string
	h := auth.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c := FromContext(r.Context()); c != nil {
			gotSubject = c.Subject
		}
	}))
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	h.ServeHTTP(httptest.NewRecorder(), req)
	if gotSubject != "webhook-client" {
		t.Errorf("subject = %q", gotSubject)
	}
}
