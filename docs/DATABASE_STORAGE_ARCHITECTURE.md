# Database and Storage Architecture Plan

## Executive Summary

**Standard Architecture**: External PostgreSQL + opsbox PM2 via Cloudflare tunnel (backend) + Cloudflare Workers (frontend). Render/Railway retired — this doc is historical.

This architecture separates concerns: Railway handles all backend infrastructure including PostgreSQL databases and API services, while Render handles frontend web applications with excellent Next.js support and global edge network.

## Port Assignments

**Development Port Assignments:**
- **Frontend (project-web)**: Port 3025
- **Backend (project-api)**: Port 4025

**Environment Variables:**
- `PORT`: Backend service port (default: 4025)
- `NEXT_PUBLIC_API_URL`: Frontend API URL (default: `http://localhost:4025`)
- `EXPO_PUBLIC_API_URL`: Mobile API URL (default: `http://localhost:4025`)

**Production URLs:**
- **Frontend**: Render service URL
- **Backend**: Railway service URL

## Current State Analysis

### Database Status
| Project | Current Database | ORM | Current Status |
|---------|-----------------|-----|----------------|
| Settle | None | None | ✅ Greenfield |
| Reid | Supabase → Railway | Raw `pg` | 🔄 Migration in progress |
| Notyced | Supabase | TypeORM | ⏳ Needs Railway migration |
| Prime | Render | TypeORM | ⏳ Gradual migration planned |

### Storage Status
| Project | Current Storage | Status |
|---------|----------------|--------|
| Settle | None | ✅ Greenfield |
| Reid | Local filesystem | ⏳ Needs implementation |
| Notyced | Cloudflare R2 | ⏳ Needs migration to Railway-compatible solution |
| Prime | Local filesystem | ⏳ Needs implementation |

## Implementation Plan

### Phase 1: Settle (Greenfield - Immediate)
**Timeline**: Week 1
**Effort**: Low

**Database Setup**:
1. Add Railway PostgreSQL service to Settle Railway project
2. Configure TypeORM (following Prime/Notyced pattern)
3. Implement standard User entity schema
4. Set up database migrations
5. Configure `DATABASE_URL` environment variable

**Frontend Setup**:
1. Create Render web service for Settle
2. Configure Next.js deployment on Render
3. Set up environment variables in Render
4. Configure build and start commands for pnpm
5. Set up custom domain and SSL

**Benefits**:
- Clean implementation from scratch
- Sets the standard for other projects
- No migration complexity

### Phase 2: Reid (Migration - Week 2)
**Timeline**: Week 2
**Effort**: Medium

**Database Migration**:
1. ✅ Migration scripts already created
2. Create Railway PostgreSQL service
3. Run migration scripts to transfer data
4. Update `DATABASE_URL` to Railway
5. Remove Supabase database dependencies
6. Test all database operations

**Frontend Migration**:
1. Create Render web service for Reid
2. Migrate from current deployment to Render
3. Configure pnpm build and start commands
4. Set up environment variables
5. Update custom domain and SSL

**File Storage**:
1. Implement file storage using Railway-compatible solution
2. Migrate existing local files
3. Update upload endpoints
4. Remove local filesystem storage

**Benefits**:
- Migration scripts already ready
- Can test with small dataset first
- Rollback plan available

### Phase 3: Notyced (Migration - Week 3)
**Timeline**: Week 3
**Effort**: Medium-High

**Database Migration**:
1. Export data from Supabase PostgreSQL
2. Create Railway PostgreSQL service
3. Import data to Railway PostgreSQL
4. Update TypeORM configuration for Railway
5. Update `DATABASE_URL` environment variable
6. Remove Supabase database connection
7. Test all TypeORM operations

**Frontend Migration**:
1. Create Render web service for Notyced
2. Migrate from Render PostgreSQL to Railway for backend
3. Keep frontend on Render (or migrate to Railway if preferred)
4. Update environment variables
5. Test all frontend operations

**Storage Migration**:
1. Export data from Cloudflare R2
2. Implement Railway-compatible storage solution
3. Import data to new storage
4. Replace R2 client with new storage client
5. Update upload/download endpoints
6. Remove R2 dependencies

**Benefits**:
- TypeORM already configured (just change connection)
- Standard storage across all projects
- Remove Cloudflare dependency

### Phase 4: Prime (Gradual - Week 4-6)
**Timeline**: Week 4-6
**Effort**: High

**Database Migration**:
1. Create comprehensive backup of Render PostgreSQL
2. Set up Railway PostgreSQL service
3. Migrate schema and data
4. Update TypeORM configuration
5. Test all complex queries and relationships
6. Update Redis configuration for Railway
7. Gradual traffic migration (canary deployment)
8. Monitor performance and rollback if needed

**Frontend Migration**:
1. Create Render web service for Prime
2. Migrate frontend from current deployment to Render
3. Configure pnpm build and start commands
4. Set up environment variables
5. Test all frontend operations
6. Update mobile app API endpoints

**File Storage**:
1. Audit all file upload endpoints
2. Implement Railway-compatible storage solution
3. Implement parallel storage (write to both local and new storage)
4. Migrate existing files to new storage
5. Update all upload endpoints
6. Remove local filesystem storage
7. Update mobile app upload logic

**Benefits**:
- Gradual migration reduces risk
- Can test with subset of users first
- Prime is most complex, deserves careful approach

## Standard Configuration Patterns

### Railway PostgreSQL Configuration

**Environment Variables**:
```bash
# Railway auto-injects DATABASE_URL when PostgreSQL service is added
DATABASE_URL=postgresql://user:password@host.railway.app:5432/database
```

**TypeORM Configuration** (Standard Pattern):
```typescript
// src/data-source.ts
export const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') 
    ? { rejectUnauthorized: false }
    : false,
  entities: [User, /* other entities */],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
```

**Railway.toml** (Standard Pattern):
```toml
[build]
builder = "NIXPACKS"
buildCommand = "cd project-api && pnpm install && pnpm run build"

[deploy]
startCommand = "cd project-api && pnpm start"
healthcheckPath = "/health"

# DATABASE_URL auto-injected when PostgreSQL service is added
```

### Render Frontend Configuration

**Environment Variables**:
```bash
# Render auto-injects these for build
NEXT_PUBLIC_API_URL=https://api.project.railway.app
NODE_ENV=production
```

**render.yaml** (Standard Pattern):
```yaml
services:
  - type: web
    name: project-web
    env: node
    buildCommand: pnpm install && pnpm run build
    startCommand: pnpm start
    envVars:
      - key: NEXT_PUBLIC_API_URL
        value: https://api.project.railway.app
```

**Root Directory Configuration**:
```
Root Directory: project-web
Build Command: pnpm install && pnpm run build
Start Command: pnpm start
```

### File Storage Strategy

**For file storage, use Railway-compatible solutions:**

1. **Railway Volumes** - For persistent disk storage
2. **S3-compatible services** - Railway integrates with various S3 alternatives
3. **Local storage during development** - For testing
4. **Cloud storage services** - For production (AWS S3, DigitalOcean Spaces, etc.)

**Standard Pattern**:
```typescript
// Development: Local filesystem
const UPLOAD_DIR = process.env.NODE_ENV === 'development' 
  ? './uploads' 
  : '/data/uploads';

// Production: Railway volumes or cloud storage
const storageProvider = process.env.STORAGE_PROVIDER || 'local';
```

## Shared SDK Storage Integration

### Update @settle/shared-sdk

**Add Storage Module** (Railway-compatible):
```typescript
// packages/shared-sdk/src/storage/index.ts
export interface StorageConfig {
  provider: 'local' | 'railway-volume' | 's3';
  localDir?: string;
  s3Config?: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region?: string;
  };
}

export function createStorageClient(config: StorageConfig) {
  if (config.provider === 'local') {
    return {
      upload: async (path: string, file: Buffer) => {
        // Local filesystem implementation
        const fs = await import('fs/promises');
        const filePath = `${config.localDir || './uploads'}/${path}`;
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file);
        return { path: filePath };
      },
      getPublicUrl: (path: string) => {
        return `${process.env.APP_URL}/uploads/${path}`;
      },
      delete: async (path: string) => {
        const fs = await import('fs/promises');
        const filePath = `${config.localDir || './uploads'}/${path}`;
        await fs.unlink(filePath);
      }
    };
  }

  if (config.provider === 's3' && config.s3Config) {
    // S3-compatible implementation (AWS S3, DigitalOcean Spaces, etc.)
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    
    const s3Client = new S3Client({
      endpoint: config.s3Config.endpoint,
      credentials: {
        accessKeyId: config.s3Config.accessKeyId,
        secretAccessKey: config.s3Config.secretAccessKey,
      },
      region: config.s3Config.region || 'us-east-1',
    });

    return {
      upload: async (path: string, file: Buffer) => {
        await s3Client.send(new PutObjectCommand({
          Bucket: config.s3Config.bucket,
          Key: path,
          Body: file,
        }));
        return { path };
      },
      getPublicUrl: (path: string) => {
        return `${config.s3Config.endpoint}/${config.s3Config.bucket}/${path}`;
      },
      delete: async (path: string) => {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: config.s3Config.bucket,
          Key: path,
        }));
      }
    };
  }

  throw new Error(`Unsupported storage provider: ${config.provider}`);
}
```

## Migration Scripts

### Database Migration Script Template

```typescript
// scripts/migrate-database.ts
import { Client } from 'pg';

async function migrateDatabase() {
  const sourceClient = new Client({ connectionString: process.env.SOURCE_DATABASE_URL });
  const targetClient = new Client({ connectionString: process.env.TARGET_DATABASE_URL });

  try {
    await sourceClient.connect();
    await targetClient.connect();

    // Migrate each table
    const tables = ['users', 'projects', /* other tables */];
    
    for (const table of tables) {
      console.log(`Migrating ${table}...`);
      
      const { rows } = await sourceClient.query(`SELECT * FROM ${table}`);
      
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        
        await targetClient.query(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }
      
      console.log(`Migrated ${rows.length} rows from ${table}`);
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

migrateDatabase();
```

### Storage Migration Script Template

```typescript
// scripts/migrate-storage.ts
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

async function migrateStorage() {
  const localDir = process.env.LOCAL_UPLOAD_DIR || './uploads';
  const targetProvider = process.env.TARGET_STORAGE_PROVIDER || 'local';
  const targetDir = process.env.TARGET_UPLOAD_DIR || '/data/uploads';

  try {
    const files = await readdir(localDir);
    
    for (const file of files) {
      const filePath = join(localDir, file);
      const fileBuffer = await readFile(filePath);
      
      console.log(`Migrating ${file}...`);
      
      if (targetProvider === 'local') {
        const fs = await import('fs/promises');
        const targetPath = join(targetDir, file);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, fileBuffer);
      } else if (targetProvider === 's3') {
        // S3 migration logic
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          endpoint: process.env.S3_ENDPOINT,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          },
        });
        
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: file,
          Body: fileBuffer,
        }));
      }
      
      console.log(`Successfully migrated ${file}`);
    }
    
    console.log('Storage migration completed');
  } catch (error) {
    console.error('Storage migration failed:', error);
    throw error;
  }
}

migrateStorage();
```

## Cost Analysis

### Railway Costs
- **Free Tier**: $5/month credit (includes 1x PostgreSQL)
- **Starter**: $5/month for additional services
- **Standard**: $20/month for production

### Render Costs
- **Free Tier**: $0/month (web services spin down after inactivity)
- **Starter**: $7/month (512MB RAM, 0.5 CPU)
- **Standard**: $25/month (2GB RAM, 1 CPU)
- **Pro**: $85/month (4GB RAM, 2 CPU)

### Storage Costs
- **Railway Volumes**: Included with service pricing
- **S3-compatible services**: Varies by provider
  - AWS S3: $0.023/GB storage + $0.09/GB transfer
  - DigitalOcean Spaces: $0.02/GB storage + $0.01/GB transfer

### Total Estimated Monthly Costs
- **Development**: $0 (Railway free tier + Render free tier)
- **Production**: $25-45/month (Railway Standard + Render Starter)

## Benefits of This Architecture

### 1. **Separation of Concerns**
- Railway: Optimized for PostgreSQL, connection pooling, backups, backend services
- Render: Optimized for Next.js frontend applications, static site generation, edge network

### 2. **Cost Efficiency**
- Railway: Excellent value for PostgreSQL and backend services
- Render: Competitive pricing for frontend with free tier for development
- Storage: Flexible options from local to cloud S3-compatible services

### 3. **Developer Experience**
- Railway: Easy database management, automatic backups, private networking
- Render: Excellent Next.js support, automatic SSL, custom domains
- Storage: Multiple options depending on needs and budget

### 4. **Scalability**
- Railway: Easy vertical scaling, read replicas, service composition
- Render: Automatic scaling, global edge network, CDN
- Storage: Scale from local volumes to cloud S3 as needed

### 5. **Consistency**
- All projects use same backend (Railway) and frontend (Render) stack
- Shared knowledge and tooling
- Easier cross-project maintenance

## Risk Mitigation

### Database Migration Risks
- **Data Loss**: Implement comprehensive backups before migration
- **Downtime**: Use canary deployments for gradual migration
- **Performance**: Monitor query performance during migration
- **Rollback**: Keep old database running until migration verified

### Storage Migration Risks
- **File Loss**: Verify all files migrated before deletion
- **Broken Links**: Update all file references in database
- **Performance**: Test file upload/download speeds
- **Cost**: Monitor storage usage and bandwidth
- **Storage Provider**: Choose appropriate storage solution (local vs cloud)

## Success Criteria

### Database Migration Success
- [ ] All data migrated without loss
- [ ] All database operations working correctly
- [ ] Performance equal or better than before
- [ ] No data corruption
- [ ] Backup and restore tested

### Storage Migration Success
- [ ] All files migrated without loss
- [ ] All upload/download endpoints working
- [ ] File serving performance acceptable
- [ ] CDN working correctly
- [ ] Storage costs within budget

## Timeline Summary

| Week | Project | Focus |
|------|---------|-------|
| 1 | Settle | Railway PostgreSQL + Supabase Storage setup |
| 2 | Reid | Complete database migration + storage setup |
| 3 | Notyced | Database migration + storage migration |
| 4-6 | Prime | Gradual database + storage migration |

## Next Steps

1. **Immediate**: Start Settle implementation (greenfield)
2. **Week 2**: Execute Reid migration (scripts ready)
3. **Week 3**: Plan Notyced migration in detail
4. **Week 4**: Begin Prime migration planning
5. **Ongoing**: Monitor and optimize all migrations