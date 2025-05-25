const fs = require('fs');
const path = require('path');

const axios = require('axios');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const DatabaseManager = require('./db_manager'); 

require('dotenv').config(); // Load environment variables from .env file


class H1BJobScraper {
    constructor(serpApiKey, dbPath = 'h1b_jobs.db') {
        this.serpApiKey = serpApiKey;
        this.h1bCompanies = new Set();
        this.csvFilePath = 'h1b_job_results.csv';
        this.h1bCsvPath = 'h1b_companies.csv';
        
        // Initialize database manager
        this.dbManager = new DatabaseManager(dbPath);
        
        // CSV writer configuration (keeping as backup option)
        this.csvWriter = createCsvWriter({
            path: this.csvFilePath,
            header: [
                { id: 'company_name', title: 'Company Name' },
                { id: 'job_title', title: 'Job Title' },
                { id: 'posting_time', title: 'Posting Time' },
                { id: 'job_location', title: 'Job Location' },
                { id: 'job_type', title: 'Job Type' },
                { id: 'job_description', title: 'Job Description' },
                { id: 'work_setting', title: 'Work Setting' },
                { id: 'ats_apply_link', title: 'ATS Apply Link' },
                { id: 'scraped_at', title: 'Scraped At' }
            ],
            append: true
        });

        // Scraping statistics
        this.stats = {
            jobsScraped: 0,
            jobsFiltered: 0,
            jobsInserted: 0,
            jobsDuplicated: 0,
            apiCallsMade: 0,
            status: 'success',
            errorMessage: null
        };
    }

    // Initialize database and load H1B companies
    async initialize() {
        try {
            console.log('Initializing database...');
            await this.dbManager.initialize();
            
            console.log('Loading H1B companies...');
            await this.loadH1BCompanies();
            
            // Store H1B companies in database
            if (this.h1bCompanies.size > 0) {
                const companiesArray = Array.from(this.h1bCompanies);
                await this.dbManager.insertH1BCompanies(companiesArray);
            }

            console.log('Initialization complete!');
        } catch (error) {
            console.error('Error during initialization:', error);
            throw error;
        }
    }

    // Load H1B companies from CSV or database
    async loadH1BCompanies() {
        try {
            // First try to load from database
            const dbCompanies = await this.dbManager.getH1BCompanies();
            
            if (dbCompanies.size > 0) {
                this.h1bCompanies = dbCompanies;
                console.log(`Loaded ${this.h1bCompanies.size} H1B companies from database`);
                return;
            }

            // If database is empty, load from CSV
            console.log('Loading H1B companies from CSV...');
            const companies = [];
            
            return new Promise((resolve, reject) => {
                fs.createReadStream(this.h1bCsvPath)
                    .pipe(csv())
                    .on('data', (row) => {
                        let companyName = row['EMPLOYER_NAME'] || row['employer_name'] || 
                                         row['company_name'] || row['Company Name'] || 
                                         row['name'] || Object.values(row)[0];
                        
                        if (companyName) {
                            companyName = companyName.replace(/^["']|["']$/g, '').trim();
                            if (companyName) {
                                companies.push(companyName.toLowerCase());
                            }
                        }
                    })
                    .on('end', () => {
                        this.h1bCompanies = new Set(companies);
                        console.log(`Loaded ${this.h1bCompanies.size} H1B companies from CSV`);
                        console.log('Sample companies:', Array.from(this.h1bCompanies).slice(0, 5));
                        resolve();
                    })
                    .on('error', reject);
            });
        } catch (error) {
            console.error('Error loading H1B companies:', error);
            throw error;
        }
    }

    // Check if company is in H1B list 
    isH1BCompany(companyName) {
        if (!companyName) return false;
        
        const normalizedName = companyName.toLowerCase().trim();
        
        if (this.h1bCompanies.has(normalizedName)) {
            return true;
        }
        
        for (const h1bCompany of this.h1bCompanies) {
            const cleanJobCompany = this.cleanCompanyName(normalizedName);
            const cleanH1bCompany = this.cleanCompanyName(h1bCompany);
            
            if (cleanJobCompany === cleanH1bCompany ||
                cleanJobCompany.includes(cleanH1bCompany) ||
                cleanH1bCompany.includes(cleanJobCompany) ||
                this.isSubstantialMatch(cleanJobCompany, cleanH1bCompany)) {
                return true;
            }
        }
        
        return false;
    }

    // Clean company names for better matching
    cleanCompanyName(name) {
        return name
            .replace(/\b(inc\.?|llc\.?|corp\.?|corporation|company|co\.?|ltd\.?|limited|services|group|technologies|tech|systems|solutions)\b/g, '')
            .replace(/[,\.]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Check if two company names have substantial overlap
    isSubstantialMatch(name1, name2) {
        const words1 = name1.split(' ').filter(w => w.length > 2);
        const words2 = name2.split(' ').filter(w => w.length > 2);
        
        if (words1.length === 0 || words2.length === 0) return false;
        
        const commonWords = words1.filter(word => words2.includes(word));
        const matchRatio = commonWords.length / Math.min(words1.length, words2.length);
        
        return matchRatio >= 0.6;
    }

    // Extract work setting from job description or extensions
    extractWorkSetting(description, extensions) {
        const text = (description + ' ' + (extensions || []).join(' ')).toLowerCase();
        
        if (text.includes('remote') && (text.includes('onsite') || text.includes('office'))) {
            return 'Hybrid';
        } else if (text.includes('remote')) {
            return 'Remote';
        } else if (text.includes('onsite') || text.includes('office') || text.includes('on-site')) {
            return 'Onsite';
        }
        
        return 'Not Specified';
    }

    getATSApplyLink(applyOptions) {
        if (!applyOptions || applyOptions.length === 0) return '';
        
        const priorities = ['career', 'jobs', 'workday', 'greenhouse', 'lever', 'bamboohr'];
        
        for (const priority of priorities) {
            const found = applyOptions.find(option => 
                option.title.toLowerCase().includes(priority) || 
                option.link.toLowerCase().includes(priority)
            );
            if (found) return found.link;
        }
        
        return applyOptions[0].link;
    }

    // Fetch jobs from SerpAPI
    async fetchJobs(startIndex = 0) {
        try {
            console.log(`Fetching jobs from SerpAPI (start: ${startIndex})...`);
            
            const response = await axios.get('https://serpapi.com/search.json', {
                params: {
                    engine: 'google_jobs',
                    q: 'Data Engineer',
                    hl: 'en',
                    api_key: this.serpApiKey
                }
            });

            this.stats.apiCallsMade++;
            return response.data;
        } catch (error) {
            console.error('Error fetching jobs from SerpAPI:', error.message);
            this.stats.status = 'error';
            this.stats.errorMessage = error.message;
            throw error;
        }
    }

    // Process and filter jobs
    async processJobs() {
        try {
            const allJobs = [];
            let startIndex = 0;
            const maxPages = 3;
            
            for (let page = 0; page < maxPages; page++) {
                const data = await this.fetchJobs(startIndex);
                
                if (!data.jobs_results || data.jobs_results.length === 0) {
                    console.log('No more jobs found');
                    break;
                }

                console.log(`Processing ${data.jobs_results.length} jobs from page ${page + 1}`);
                this.stats.jobsScraped += data.jobs_results.length;

                for (const job of data.jobs_results) {
                    // Check if company is in H1B list
                    if (!this.isH1BCompany(job.company_name)) {
                        continue;
                    }

                    this.stats.jobsFiltered++;

                    const processedJob = {
                        company_name: job.company_name || '',
                        job_title: job.title || '',
                        posting_time: job.detected_extensions?.posted_at || 
                                     (job.extensions && job.extensions[0]) || '',
                        job_location: job.location || '',
                        job_type: job.detected_extensions?.schedule_type || 
                                 this.extractJobType(job.extensions) || '',
                        job_description: job.description || '',
                        work_setting: this.extractWorkSetting(job.description, job.extensions),
                        ats_apply_link: this.getATSApplyLink(job.apply_options),
                        scraped_at: new Date().toISOString()
                    };

                    allJobs.push(processedJob);
                    console.log(`✓ Found H1B job: ${job.company_name} - ${job.title}`);
                }

                startIndex += 10;
                
                // Add delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            return allJobs;
        } catch (error) {
            console.error('Error processing jobs:', error);
            this.stats.status = 'error';
            this.stats.errorMessage = error.message;
            throw error;
        }
    }

    // Extract job type from extensions
    extractJobType(extensions) {
        if (!extensions) return '';
        
        const jobTypes = ['full-time', 'part-time', 'contract', 'internship', 'temporary'];
        
        for (const ext of extensions) {
            const lowerExt = ext.toLowerCase();
            for (const type of jobTypes) {
                if (lowerExt.includes(type)) {
                    return type.charAt(0).toUpperCase() + type.slice(1);
                }
            }
        }
        
        return '';
    }

    // Save jobs to database (primary) and CSV (backup)
    async saveJobs(jobs) {
        try {
            if (jobs.length === 0) {
                console.log('No H1B jobs found to save');
                return;
            }

            // Save to database (primary storage)
            const dbResult = await this.dbManager.insertJobs(jobs);
            this.stats.jobsInserted = dbResult.inserted;
            this.stats.jobsDuplicated = dbResult.duplicated;

            // Also save to CSV as backup
            await this.saveJobsToCSV(jobs);

            console.log(`✓ Database: ${dbResult.inserted} new jobs, ${dbResult.duplicated} duplicates`);
            console.log(`✓ CSV backup: ${jobs.length} jobs saved`);
        } catch (error) {
            console.error('Error saving jobs:', error);
            this.stats.status = 'error';
            this.stats.errorMessage = error.message;
            throw error;
        }
    }

    // Save jobs to CSV (backup method)
    async saveJobsToCSV(jobs) {
        try {
            // Check if file exists, if not create with headers
            try {
                await fs.promises.access(this.csvFilePath);
            } catch {
                await this.csvWriter.writeRecords([]);
            }

            await this.csvWriter.writeRecords(jobs);
        } catch (error) {
            console.error('Error saving jobs to CSV:', error);
            throw error;
        }
    }

    // Get scraping statistics
    async getScrapingStats() {
        try {
            return await this.dbManager.getScrapingStats();
        } catch (error) {
            console.error('Error getting scraping stats:', error);
            return null;
        }
    }

    // Export database to CSV
    async exportDatabaseToCSV(outputPath = 'database_export.csv') {
        try {
            return await this.dbManager.exportToCSV(outputPath);
        } catch (error) {
            console.error('Error exporting database to CSV:', error);
            throw error;
        }
    }

    // Main scraping function
    async scrapeJobs() {
        try {
            console.log('=== Starting H1B Job Scraping ===');
            console.log(`Timestamp: ${new Date().toISOString()}`);
            
            // Reset stats for this run
            this.stats = {
                jobsScraped: 0,
                jobsFiltered: 0,
                jobsInserted: 0,
                jobsDuplicated: 0,
                apiCallsMade: 0,
                status: 'success',
                errorMessage: null
            };

            const jobs = await this.processJobs();
            await this.saveJobs(jobs);
            
            // Log scraping run to database
            await this.dbManager.logScrapingRun(this.stats);
            
            console.log('=== Scraping Completed ===');
            console.log(`Scraped: ${this.stats.jobsScraped} jobs`);
            console.log(`Filtered: ${this.stats.jobsFiltered} H1B jobs`);
            console.log(`Inserted: ${this.stats.jobsInserted} new jobs`);
            console.log(`Duplicates: ${this.stats.jobsDuplicated} jobs`);
            console.log(`API calls: ${this.stats.apiCallsMade}`);
            
            return jobs;
        } catch (error) {
            console.error('Scraping failed:', error);
            this.stats.status = 'error';
            this.stats.errorMessage = error.message;
            await this.dbManager.logScrapingRun(this.stats);
            throw error;
        }
    }

    // Start automated scraping every hour
    startAutomatedScraping() {
        console.log('Starting automated H1B job scraping (every 1 hour)...');
        
        // Run immediately
        this.scrapeJobs().catch(console.error);
        
        // Schedule to run every hour
        const intervalId = setInterval(() => {
            this.scrapeJobs().catch(console.error);
        }, 60 * 60 * 1000); // 1 hour in milliseconds

        // Store interval ID for cleanup
        this.intervalId = intervalId;
    }

    // Stop automated scraping and cleanup
    async cleanup() {
        console.log('Cleaning up H1B Job Scraper...');
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        if (this.dbManager) {
            await this.dbManager.close();
        }
        
        console.log('Cleanup completed');
    }
}

// Main function
async function main() {
    const SERP_API_KEY = process.env.SERP_API_KEY;
    
    if (!SERP_API_KEY) {
        console.log(process.env.SERP_API_KEY);
        console.error('SERP_API_KEY environment variable is required');
        process.exit(1);
    }

    const scraper = new H1BJobScraper(SERP_API_KEY);

    try {
        // Initialize database and load companies
        await scraper.initialize();
        
        // Start automated scraping
        scraper.startAutomatedScraping();
        
        // Display initial stats
        setTimeout(async () => {
            const stats = await scraper.getScrapingStats();
            if (stats) {
                console.log('\n=== Database Statistics ===');
                console.log(`Total jobs: ${stats.totalJobs}`);
                console.log(`Jobs in last 24h: ${stats.recentJobs}`);
                console.log(`Total companies: ${stats.totalCompanies}`);
                console.log('Recent runs:', stats.recentRuns.length);
            }
        }, 5000);
        
    } catch (error) {
        console.error('Failed to start scraper:', error);
        await scraper.cleanup();
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    // Global scraper instance would need to be accessible here
    // You might want to make scraper a global variable or use a different approach
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down...');
    process.exit(0);
});

// Run if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}



module.exports = H1BJobScraper;