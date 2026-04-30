# Smart Resume Analyzer
## Overview
TalentCortex is an automated intelligence system designed to bridge the gap between unstructured candidate data and recruitment requirements. The system utilizes advanced Natural Language Processing (NLP) and Large Language Models (LLMs) to perform context-aware resume parsing, scoring, and skill-gap identification.
## Features

* Resume Parsing
  Extracts key information such as skills, education, and experience from uploaded resumes.

* Job Description Matching
  Compares resumes with job descriptions using intelligent text analysis and vectors.

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

### Frontend

* HTML - Structures the basic layout and content of the user dashboard.
* CSS - Styles the visual presentation and layout of the web pages.
* JavaScript - Handles user interactivity and asynchronous communication with the backend.

### Backend

* Python - Serves as the core programming language handling all server-side logic and AI integration.
* Flask - Acts as the lightweight web framework connecting the frontend interface to the backend processes.

### Databases

* SQLite - Stores structured, standard application data like user details and historical results.
* ChromaDB - Acts as a vector database to store and quickly search the mathematical embeddings of resumes and job descriptions.

### AI & Document Processing

* Google Gemini API - Powers the semantic extraction and intent-based evaluation of the resumes.
* LlamaParse - Accurately extracts text and structural data (like tables) from complex PDF or DOCX files.
* LangChain - Orchestrates the data flow and prompt management between the application and the Gemini LLM.

### Libraries and Tools

* python-dotenv - Securely loads and manages sensitive environment variables like your API keys.
* Sentence Transformers - Converts raw text into vector embeddings so the system can understand semantic meaning.
* Scikit-learn - Provides fundamental machine learning algorithms for tasks like calculating cosine similarity.
* Pandas - Processes and structures the extracted data for easier manipulation and analysis.

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

1. User uploads a resume (PDF/DOCX) and provides a target job description.
2. The resume is processed through LlamaParse to accurately extract text while preserving complex structures like tables and multi-column layouts.
3. LangChain orchestrates the data flow, passing the parsed document to the Gemini API for deep semantic extraction of skills, education, and project impact.
4. The system evaluates the candidate's profile against the job description using semantic embeddings rather than simple keyword matching.
5. A diagnostic logic layer analyzes the results to calculate an ATS-style compatibility score and identify specific missing competencies.
6. The Flask backend processes this data and sends it to the frontend.
7. Results, including the final score, skill gap analysis, and actionable suggestions, are displayed on the user dashboard.
---

### Prerequisites

* Python 3.x
* pip

## Key Concepts Used

1. Applicant Tracking Systems (ATS)
2. Natural Language Processing
3. Cosine Similarity for text matching
4. Keyword extraction and matching
5. Semantic search using embeddings
6. Vector databases (ChromaDB)
7. Machine Learning-based prediction

---

## Limitations
1. Accuracy depends on resume format and text quality
2. Basic NLP techniques may miss deeper context in some cases
3. ATS scoring is simulated and may differ from real-world systems

---

## License

This project is for educational purposes. You are free to modify and use it.

---

## Author

## Authors

* Atharva Jadhav 
* Aaron Fernandes
* Nathan D'cunha
* Vishal Jankar


This project was developed collaboratively as part of an academic mini project.

---
