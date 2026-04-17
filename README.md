# Smart Resume Analyzer

## Overview

Smart Resume Analyzer is a web-based application that simulates an Applicant Tracking System (ATS) using Natural Language Processing and Machine Learning techniques.

It evaluates resumes against job descriptions, calculates ATS-style matching scores, identifies missing skills, and provides actionable suggestions to improve resume quality.

The system helps job seekers understand how automated recruitment systems screen resumes and optimize their profiles for better selection chances.

---

## Features

* Resume Parsing
  Extracts key information such as skills, education, and experience from uploaded resumes.

* Job Description Matching
  Compares resumes with job descriptions using intelligent text analysis.

* ATS-Based Scoring
  Generates a score similar to real-world Applicant Tracking Systems.

* Skill Analysis
  Identifies relevant and missing skills required for a job role.

* Job Role Prediction
  Suggests suitable job roles based on resume content.

* Visual Insights
  Displays analytical insights for better understanding of performance.

* User-Friendly Interface
  Simple interface for uploading resumes and viewing results.

---

## ATS-Based Analysis

This project incorporates core functionalities inspired by modern Applicant Tracking Systems:

* Keyword Matching
  Detects important keywords from job descriptions and checks their presence in resumes

* Resume Ranking
  Assigns a score similar to ATS ranking systems used by recruiters

* Skill Gap Detection
  Highlights missing skills required for a specific role

* Filtering Simulation
  Demonstrates how resumes may be filtered out based on low relevance scores

* Optimization Suggestions
  Provides recommendations to improve ATS compatibility

---

## Tech Stack

### Frontend

* HTML
* CSS
* JavaScript

### Backend

* Python
* Flask

### Databases

* SQL (SQLite) for structured data storage such as user data and results
* ChromaDB for vector storage and semantic search of resume and job description embeddings

### Libraries and Tools

* Natural Language Processing (NLP)
* Scikit-learn
* Cosine Similarity
* Sentence Transformers (for embeddings)
* ChromaDB (vector database)

---

## Project Structure

```
Smart_Resume_Analyzer/
│
├── backend/
│   ├── app.py
│   ├── database.py
│   ├── matcher.py
│   ├── resume_parser.py
│   ├── embeddings.py
│   ├── requirements.txt
│   └── talentcortex.db
│
├── frontend/
│   └── index.html
│
└── README.md
```

---

## How It Works

1. User uploads a resume.
2. Resume is parsed to extract text and relevant information.
3. User provides a job description.
4. Text data is processed using NLP techniques.
5. ATS-style matching is performed using cosine similarity, keyword matching, and semantic similarity via embeddings.
6. ChromaDB is used to store and compare vector representations for deeper contextual matching.
7. Results including score, skill gaps, and suggestions are displayed.

---

## Installation and Setup

### Prerequisites

* Python 3.x
* pip

### Steps

1. Clone the repository

```
git clone https://github.com/your-username/Smart_Resume_Analyzer.git
cd Smart_Resume_Analyzer
```

2. Install dependencies

```
cd backend
pip install -r requirements.txt
```

3. Run the backend server

```
python app.py
```

4. Open frontend

* Navigate to the frontend folder
* Open `index.html` in your browser

---

## Usage

* Upload your resume
* Enter or upload a job description
* View:

  * ATS score
  * Skill match and gaps
  * Suggested improvements

---

## Key Concepts Used

* Applicant Tracking Systems (ATS)
* Natural Language Processing
* Cosine Similarity for text matching
* Keyword extraction and matching
* Semantic search using embeddings
* Vector databases (ChromaDB)
* Machine Learning-based prediction

---

## Future Enhancements

* User authentication system
* Dashboard with analytics
* Resume scoring history
* Integration with job portals
* Advanced ML models for better predictions
* Automated email feedback system

---

## Limitations

* Accuracy depends on resume format and text quality
* Basic NLP techniques may miss deeper context in some cases
* Limited dataset for job role prediction
* ATS scoring is simulated and may differ from real-world systems

---

## Contributing

Contributions are welcome. You can improve the project by adding features, fixing bugs, or optimizing performance.

Steps:

1. Fork the repository
2. Create a new branch
3. Make changes
4. Submit a pull request

---

## License

This project is for educational purposes. You are free to modify and use it.

---

## Author

## Authors

* Aaron Fernandes
* Atharva Jadhav 
* Vishal Jankar
* Nathan D'cunha

This project was developed collaboratively as part of an academic mini project.

---
