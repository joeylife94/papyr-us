-- Add support for advanced block types and relational database fields

-- Database schemas table - stores metadata for database-like pages
CREATE TABLE IF NOT EXISTS database_schemas (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]', -- Array of field configurations
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Database rows table - stores individual records in database pages
CREATE TABLE IF NOT EXISTS database_rows (
  id SERIAL PRIMARY KEY,
  schema_id INTEGER NOT NULL REFERENCES database_schemas(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}', -- Row data as key-value pairs
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Database relations table - stores relationships between rows
CREATE TABLE IF NOT EXISTS database_relations (
  id SERIAL PRIMARY KEY,
  from_schema_id INTEGER NOT NULL REFERENCES database_schemas(id) ON DELETE CASCADE,
  from_row_id INTEGER NOT NULL REFERENCES database_rows(id) ON DELETE CASCADE,
  to_schema_id INTEGER NOT NULL REFERENCES database_schemas(id) ON DELETE CASCADE,
  to_row_id INTEGER NOT NULL REFERENCES database_rows(id) ON DELETE CASCADE,
  property_name TEXT NOT NULL, -- Name of the relation field
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Synced blocks table - stores synchronized content blocks
CREATE TABLE IF NOT EXISTS synced_blocks (
  id SERIAL PRIMARY KEY,
  original_block_id TEXT NOT NULL UNIQUE, -- ID of the original block
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  content JSONB NOT NULL, -- Block content and properties
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Synced block references - tracks where synced blocks are used
CREATE TABLE IF NOT EXISTS synced_block_references (
  id SERIAL PRIMARY KEY,
  synced_block_id INTEGER NOT NULL REFERENCES synced_blocks(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL, -- ID of the reference block in the page
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_database_schemas_page ON database_schemas(page_id);
CREATE INDEX IF NOT EXISTS idx_database_rows_schema ON database_rows(schema_id);
CREATE INDEX IF NOT EXISTS idx_database_rows_order ON database_rows(schema_id, order_index);
CREATE INDEX IF NOT EXISTS idx_database_relations_from ON database_relations(from_schema_id, from_row_id);
CREATE INDEX IF NOT EXISTS idx_database_relations_to ON database_relations(to_schema_id, to_row_id);
CREATE INDEX IF NOT EXISTS idx_synced_blocks_original ON synced_blocks(original_block_id);
CREATE INDEX IF NOT EXISTS idx_synced_block_refs_synced ON synced_block_references(synced_block_id);
CREATE INDEX IF NOT EXISTS idx_synced_block_refs_page ON synced_block_references(page_id);

-- Comments
COMMENT ON TABLE database_schemas IS 'Metadata for database-like pages with structured fields';
COMMENT ON TABLE database_rows IS 'Individual records in database pages';
COMMENT ON TABLE database_relations IS 'Relationships between database rows (relation fields)';
COMMENT ON TABLE synced_blocks IS 'Original content for synchronized blocks';
COMMENT ON TABLE synced_block_references IS 'References to synced blocks across pages';

COMMENT ON COLUMN database_schemas.fields IS 'Array of field configs: [{name, type, config}]';
COMMENT ON COLUMN database_rows.data IS 'Row data as JSON object: {field_name: value}';
COMMENT ON COLUMN database_relations.property_name IS 'Name of the relation field in the schema';
