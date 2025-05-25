# Visa-Friendly Data Engineer Intern Assignment

A comprehensive automated system that scrapes "Data Engineer" job listings from Google Jobs using SerpAPI, filters them based on H1B sponsorship history, and stores the results in both CSV and database formats.

## 🎯 Project Overview

This project addresses the challenge of finding visa-sponsored job opportunities by:
- Scraping recent Data Engineer positions from Google Jobs
- Cross-referencing against a database of  H1B sponsor companies
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
- **Database Storage**
- **Deduplication**

### ❌ Missing Components
- **LinkedIn/Indeed Scraping**: Only Google Jobs implemented
- **Advanced Automation**: Basic setInterval (Cron/Airflow recommended)



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



## 🔍 Technical Implementation

### Web Scraping Strategy

The jobs are being taken from Serp API which returns Google Jobs on given query.
From the json response of this api we extract following things:
 - Job Title
 - Company Name
 - Job Type
 - Location
 - Description
 - Work Setting
 - Posting time
 - ATS link if available


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
The script reads from a CSV file of companies with H-1B history (h1b_companies.csv)

Matches are done using case-insensitive fuzzy matching and/or exact string comparison
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

### Automation

Currently the script uses setInterval() function but similar automation can be achieved with the help of node-cron.
A cron job can be scheduled every hour which calls the scrapeJob function and update database.

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

### Issue 2: Different Names for same company
**Solution**:
Names like Google , Google LLC refer to the same company but are treated different leading to duplication and incorrect matching. To solve this issue a fuzzy matching function is implemented which matches company names from sponsership companies list after passing it through a cleaning function and normalizing the names.

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

### Issue 5: Duplication of Data
**Problem**: Data from same job post can be inserted into DB for same company.
**Impact**: We can miss some job post for same company or there will be a lot of duplicated data.
**Mitigation**: Generated unique hashes using job title, company name , posting time and location


## Scrape Job Statistics
![Terminal Job Stats]("jobs stats.png")