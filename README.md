# H1B Data Engineer Job Scraper

A comprehensive automated system that scrapes "Data Engineer" job listings from Google Jobs using SerpAPI, filters them based on H1B sponsorship history, and stores the results in both CSV and database formats.

## 🎯 Project Overview

This project addresses the challenge of finding visa-sponsored job opportunities by:
- Scraping recent Data Engineer positions from Google Jobs
- Cross-referencing against a database of 400+ H1B sponsor companies
- Automating the process to run hourly
- Storing results in both CSV and SQLite database formats

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SerpAPI       │───▶│  Job Scraper    │───▶│  H1B Filter     │
│  (Google Jobs)  │    │  (Node.js)      │    │  (400+ cos)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Automation    │◀───│  Data Storage   │───▶│  CSV Export     │
│  (Every hour)   │    │  (SQLite)       │    │  (Backup)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Features

### ✅ Implemented
- **Web Scraping**: Google Jobs via SerpAPI with rate limiting
- **H1B Filtering**: Fuzzy matching against 400+ sponsor companies
- **CSV Storage**: Structured data export with timestamps
- **Automation**: Hourly job collection with duplicate prevention
- **Database Storage**: CSV-based (SQLite integration needed)
- **Deduplication**: Basic timestamp-based (hash-based needed)

### ❌ Missing Components
- **LinkedIn/Indeed Scraping**: Only Google Jobs implemented
- **Real-time Filtering**: 1-hour window not strictly enforced
- **Advanced Automation**: Basic setInterval (Cron/Airflow recommended)

## 📋 Requirements

### Prerequisites
- Node.js >= 16.0.0
- npm or yarn
- SerpAPI account (free tier: 100 searches/month)

### Dependencies
```json
{
  "axios": "^1.6.0",           // HTTP client for API calls
  "csv-parser": "^3.0.0",      // CSV file parsing
  "csv-writer": "^1.6.0",      // CSV file writing
  "sqlite3": "^5.1.6",         // SQLite database (to be added)
  "node-cron": "^3.0.3"        // Cron scheduling (to be added)
}
```

## 🛠️ Setup Instructions

### Step 1: Clone and Install
```bash
git clone <your-repo-url>
cd h1b-job-scraper
npm install
```

### Step 2: Configure API Key
1. Sign up at [SerpAPI](https://serpapi.com/)
2. Get your API key from dashboard
3. Update `index.js`:
```javascript
const SERP_API_KEY = 'your_actual_api_key_here';
```

### Step 3: Prepare H1B Companies Data
The `h1b_companies.csv` is already provided with 400+ companies. Format:
```csv
EMPLOYER_NAME
"FIRST TEK, INC."
Google LLC
Microsoft Corporation
Amazon.com Services LLC
...
```

### Step 4: Run the Application
```bash
# Single run
npm start

# Development mode with auto-restart
npm run dev
```

## 📊 Data Structure

### Input: H1B Companies CSV
- **Source**: USCIS H1B disclosure data (last 3 years)
- **Records**: 400+ unique employers
- **Format**: Company names with legal entity suffixes

### Output: Job Results CSV
```csv
Company Name,Job Title,Posting Time,Job Location,Job Type,Job Description,Work Setting,ATS Apply Link,Scraped At
"Google LLC","Senior Data Engineer","2 days ago","Mountain View, CA","Full-time","[Full Description]","Hybrid","https://careers.google.com/...","2024-01-15T10:30:00.000Z"
```

## 🔍 Technical Implementation

### Web Scraping Strategy
```javascript
// Multi-page scraping with rate limiting
for (let page = 0; page < maxPages; page++) {
    const data = await this.fetchJobs(startIndex);
    // Process jobs...
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
    startIndex += 10;
}
```

### H1B Company Matching
```javascript
// Fuzzy matching algorithm
isH1BCompany(companyName) {
    const normalized = companyName.toLowerCase().trim();
    
    // Direct match
    if (this.h1bCompanies.has(normalized)) return true;
    
    // Fuzzy matching
    for (const h1bCompany of this.h1bCompanies) {
        if (normalized.includes(h1bCompany) || h1bCompany.includes(normalized)) {
            return true;
        }
    }
    return false;
}
```

### Data Extraction Logic
- **Work Setting**: NLP analysis of job descriptions for remote/hybrid keywords
- **Job Type**: Extraction from structured data and extensions
- **ATS Links**: Prioritization of company career pages over job boards

## 🎯 Assessment Requirements Status

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Step 1: Web Scraping** | ✅ Completed | Google Jobs via SerpAPI |
| **Step 2: H1B Filtering** | ✅ Completed | 400+ companies, fuzzy matching |
| **Step 3: Database Loading** | ⚠️ Partial | CSV implemented, SQLite needed |
| **Step 4: Automation** | ⚠️ Partial | setInterval, needs Cron/Airflow |
| **Step 5: Demo Video** | 📋 Pending | Script provided below |

## 🔧 Known Issues & Solutions

### Issue 1: Limited Job Board Coverage
**Problem**: Only Google Jobs implemented (not LinkedIn/Indeed)
**Impact**: Medium - Google Jobs aggregates from multiple sources
**Solution**: 
```javascript
// Add multiple job board APIs
const jobBoards = ['google_jobs', 'linkedin_jobs', 'indeed_jobs'];
for (const board of jobBoards) {
    await this.scrapeJobBoard(board);
}
```

### Issue 2: Database Storage Missing
**Problem**: Only CSV storage implemented
**Impact**: High - Assessment requires SQL database
**Solution**:
```sql
-- Database schema needed
CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    posting_time TEXT,
    job_location TEXT,
    job_type TEXT,
    job_description TEXT,
    work_setting TEXT,
    ats_apply_link TEXT,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    job_hash TEXT UNIQUE -- For deduplication
);
```

### Issue 3: Basic Automation
**Problem**: Using setInterval instead of robust scheduler
**Impact**: Medium - works but not production-ready
**Solution**:
```javascript
// Use node-cron for better scheduling
const cron = require('node-cron');
cron.schedule('0 * * * *', () => {
    scraper.scrapeJobs();
});
```

### Issue 4: API Rate Limits
**Problem**: SerpAPI free tier limits (100 searches/month)
**Impact**: High - limits testing and demo
**Mitigation**: 
- Efficient pagination (3 pages max)
- 1-second delays between requests
- Error handling for rate limit exceeded

## 📈 Performance Metrics

### Current Performance
- **Jobs per hour**: ~30 (3 pages × 10 jobs)
- **H1B match rate**: ~15-20% (depends on market)
- **API efficiency**: 3 calls per run
- **Processing time**: ~5-10 seconds per run

### Scalability Considerations
- **Database indexing**: Needed for job_hash and company_name
- **Caching**: H1B company set loaded once
- **Concurrent requests**: Currently sequential (can parallelize)

