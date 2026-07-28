package cddlschema

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFileSystemCddlRepo(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "simple.cddl"), []byte("person = { name: tstr }\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "simple2.cddl"), []byte("product = { id: int }\n"), 0644); err != nil {
		t.Fatal(err)
	}

	repo, err := NewFileSystemCddlRepo(dir)
	if err != nil {
		t.Fatal(err)
	}

	all, err := repo.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) < 2 {
		t.Fatalf("expected >=2 schemas, got %d", len(all))
	}
	if _, ok := all["simple"]; !ok {
		t.Fatal("missing simple")
	}
	if _, ok := all["simple2"]; !ok {
		t.Fatal("missing simple2")
	}

	schema, err := repo.GetById("simple")
	if err != nil {
		t.Fatal(err)
	}
	if schema.ID != "simple" {
		t.Fatalf("id=%s", schema.ID)
	}
	if schema.Content == "" || schema.Name == "" {
		t.Fatal("empty content or name")
	}
}
