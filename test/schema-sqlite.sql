CREATE TABLE ways_docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (coll, id));
CREATE INDEX idx_rev ON ways_docs(rev);
CREATE TABLE ways_meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT INTO ways_meta VALUES ('rev', 0);
CREATE TABLE ways_files (id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, created_at INTEGER, created_by TEXT);
