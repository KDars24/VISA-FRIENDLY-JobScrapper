const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

class DatabaseManager {
    constructor(dbPath = 'h1b_jobs.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    // Initialize database connection and create tables
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables()
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    // Create necessary tables
    async createTables() {
        const createJobsTable = `
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_hash TEXT UNIQUE NOT NULL,
                company_name TEXT NOT NULL,
                job_title TEXT NOT NULL,
                posting_time TEXT,
                job_location TEXT,
                job_type TEXT,
                job_description TEXT,
                work_setting TEXT,
                ats_apply_link TEXT,
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(job_hash)
            )
        `;

        const createCompaniesTable = `
            CREATE TABLE IF NOT EXISTS h1b_companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name TEXT UNIQUE NOT NULL,
                normalized_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createScrapingLogsTable = `
            CREATE TABLE IF NOT EXISTS scraping_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                jobs_scraped INTEGER DEFAULT 0,
                jobs_filtered INTEGER DEFAULT 0,
                jobs_inserted INTEGER DEFAULT 0,
                jobs_duplicated INTEGER DEFAULT 0,
                status TEXT DEFAULT 'success',
                error_message TEXT,
                api_calls_made INTEGER DEFAULT 0
            )
        `;

        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(createJobsTable, (err) => {
                    if (err) {
                        console.error('Error creating jobs table:', err);
                        reject(err);
                        return;
                    }
                });

                this.db.run(createCompaniesTable, (err) => {
                    if (err) {
                        console.error('Error creating companies table:', err);
                        reject(err);
                        return;
                    }
                });

                this.db.run(createScrapingLogsTable, (err) => {
                    if (err) {
                        console.error('Error creating logs table:', err);
                        reject(err);
                        return;
                    }
                    console.log('Database tables created successfully');
                    resolve();
                });
            });
        });
    }

   
    generateJobHash(job) {
        const hashString = `${job.company_name}-${job.job_title}-${job.job_location}-${job.posting_time}`;
        return crypto.createHash('md5').update(hashString).digest('hex');
    }

    // Insert H1B companies into database
    async insertH1BCompanies(companies) {
        const insertCompany = `
            INSERT OR IGNORE INTO h1b_companies (company_name, normalized_name) 
            VALUES (?, ?)
        `;

        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(insertCompany);
            let inserted = 0;

            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                for (const company of companies) {
                    const normalized = company.toLowerCase().trim();
                    stmt.run([company, normalized], function(err) {
                        if (err) {
                            console.error('Error inserting company:', err);
                        } else if (this.changes > 0) {
                            inserted++;
                        }
                    });
                }

                this.db.run('COMMIT', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        stmt.finalize();
                        console.log(`Inserted ${inserted} H1B companies into database`);
                        resolve(inserted);
                    }
                });
            });
        });
    }

    // Insert jobs into database with deduplication
    async insertJobs(jobs) {
        if (!jobs || jobs.length === 0) {
            return { inserted: 0, duplicated: 0 };
        }

        const insertJob = `
            INSERT OR IGNORE INTO jobs (
                job_hash, company_name, job_title, posting_time, 
                job_location, job_type, job_description, work_setting, 
                ats_apply_link, scraped_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(insertJob);
            let inserted = 0;
            let duplicated = 0;

            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                for (const job of jobs) {
                    const jobHash = this.generateJobHash(job);
                    
                    stmt.run([
                        jobHash,
                        job.company_name,
                        job.job_title,
                        job.posting_time,
                        job.job_location,
                        job.job_type,
                        job.job_description,
                        job.work_setting,
                        job.ats_apply_link,
                        job.scraped_at
                    ], function(err) {
                        if (err) {
                            console.error('Error inserting job:', err);
                        } else if (this.changes > 0) {
                            inserted++;
                        } else {
                            duplicated++; // Job already exists
                        }
                    });
                }

                this.db.run('COMMIT', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        stmt.finalize();
                        console.log(`Database: ${inserted} new jobs inserted, ${duplicated} duplicates skipped`);
                        resolve({ inserted, duplicated });
                    }
                });
            });
        });
    }

    // Log scraping run statistics
    async logScrapingRun(stats) {
        const insertLog = `
            INSERT INTO scraping_logs (
                jobs_scraped, jobs_filtered, jobs_inserted, 
                jobs_duplicated, status, error_message, api_calls_made
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            this.db.run(insertLog, [
                stats.jobsScraped || 0,
                stats.jobsFiltered || 0,
                stats.jobsInserted || 0,
                stats.jobsDuplicated || 0,
                stats.status || 'success',
                stats.errorMessage || null,
                stats.apiCallsMade || 0
            ], function(err) {
                if (err) {
                    console.error('Error logging scraping run:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // Get recent jobs from database
    async getRecentJobs(limit = 50) {
        const query = `
            SELECT * FROM jobs 
            ORDER BY scraped_at DESC 
            LIMIT ?
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get H1B companies from database
    async getH1BCompanies() {
        const query = 'SELECT normalized_name FROM h1b_companies';

        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const companies = rows.map(row => row.normalized_name);
                    resolve(new Set(companies));
                }
            });
        });
    }

    // Get scraping statistics
    async getScrapingStats() {
        const queries = {
            totalJobs: 'SELECT COUNT(*) as count FROM jobs',
            recentJobs: 'SELECT COUNT(*) as count FROM jobs WHERE scraped_at > datetime("now", "-24 hours")',
            totalCompanies: 'SELECT COUNT(DISTINCT company_name) as count FROM jobs',
            recentRuns: `
                SELECT * FROM scraping_logs 
                ORDER BY run_timestamp DESC 
                LIMIT 10
            `
        };

        const stats = {};

        for (const [key, query] of Object.entries(queries)) {
            stats[key] = await new Promise((resolve, reject) => {
                this.db.all(query, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(key === 'recentRuns' ? rows : rows[0].count);
                });
            });
        }

        return stats;
    }

    // Export jobs to CSV for backup
    async exportToCSV(outputPath = 'database_export.csv') {
        const query = `
            SELECT 
                company_name as "Company Name",
                job_title as "Job Title",
                posting_time as "Posting Time",
                job_location as "Job Location",
                job_type as "Job Type",
                job_description as "Job Description",
                work_setting as "Work Setting",
                ats_apply_link as "ATS Apply Link",
                scraped_at as "Scraped At"
            FROM jobs 
            ORDER BY scraped_at DESC
        `;

        const createCsvWriter = require('csv-writer').createObjectCsvWriter;
        
        return new Promise((resolve, reject) => {
            this.db.all(query, [], async (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    try {
                        const csvWriter = createCsvWriter({
                            path: outputPath,
                            header: [
                                { id: 'Company Name', title: 'Company Name' },
                                { id: 'Job Title', title: 'Job Title' },
                                { id: 'Posting Time', title: 'Posting Time' },
                                { id: 'Job Location', title: 'Job Location' },
                                { id: 'Job Type', title: 'Job Type' },
                                { id: 'Job Description', title: 'Job Description' },
                                { id: 'Work Setting', title: 'Work Setting' },
                                { id: 'ATS Apply Link', title: 'ATS Apply Link' },
                                { id: 'Scraped At', title: 'Scraped At' }
                            ]
                        });

                        await csvWriter.writeRecords(rows);
                        console.log(`Exported ${rows.length} jobs to ${outputPath}`);
                        resolve(rows.length);
                    } catch (exportErr) {
                        reject(exportErr);
                    }
                }
            });
        });
    }

    // Close database connection
    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    } else {
                        console.log('Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = DatabaseManager;