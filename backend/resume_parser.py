import os
import re
import json
import asyncio
import platform
from typing import List

from llama_parse import LlamaParse
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
import google.generativeai as genai
import chromadb
from dotenv import load_dotenv

load_dotenv()

# Normalise keys for LangChain/Google SDK compatibility
_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
if _key:
    os.environ["GEMINI_API_KEY"] = _key
    os.environ["GOOGLE_API_KEY"] = _key

if platform.system() == "Windows":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

CHROMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")
_chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
resume_collection = _chroma_client.get_or_create_collection(
    name="resumes",
    metadata={"hnsw:space": "cosine"}
)

class ResumeStructure(BaseModel):
    name: str = Field(default="Unknown", description="Candidate's full name")
    summary: str = Field(default="", description="A short professional summary")
    skills: List[str] = Field(default=[], description="List of technical and soft skills")
    experience: List[str] = Field(default=[], description="Extract ONLY the job title, company name, and time span (e.g., 'Software Engineer at Company X (2020-2022)'). ABSOLUTELY NO descriptions, bullet points, or responsibilities.")

def extract_metadata_regex(text: str) -> dict:
    email = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    phone = re.search(r'(\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}', text)
    return {
        "email": email.group(0) if email else "N/A",
        "phone": phone.group(0) if phone else "N/A",
    }

def extract_content_with_gemini(raw_text: str) -> dict:
    try:
        model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
        parser = JsonOutputParser(pydantic_object=ResumeStructure)
        prompt = PromptTemplate(
            template="Extract data from resume into JSON.\n{format_instructions}\nRESUME:\n{text}",
            input_variables=["text"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )
        chain = prompt | model | parser
        return chain.invoke({"text": raw_text[:8000]})
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return {"error": str(e), "name": "Unknown", "summary": "", "skills": [], "experience": []}

def save_to_chromadb(content_data: dict, meta_data: dict, user_id: str, preferences: dict = None):
    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    experience_text = ' '.join(content_data.get('experience') or [])
    text_to_embed = f"Name: {content_data.get('name')} | Skills: {', '.join(content_data.get('skills') or [])} | Experience: {experience_text}"
    
    # Use gemini-embedding-001 for proper compatibility
    result = genai.embed_content(model="models/gemini-embedding-001", content=text_to_embed)
    
    resume_collection.upsert(
        ids=[f"candidate_{user_id}"],
        embeddings=[result["embedding"]],
        metadatas=[{
            "user_id": str(user_id),
            "skills": json.dumps(content_data.get("skills", [])),
            "experience": json.dumps(content_data.get("experience", [])),
            "name": content_data.get("name", "Unknown")
        }]
    )

def process_resume(file_path: str, user_id: str = "unknown") -> dict:
    if not os.path.exists(file_path): return {"error": "File not found"}
    
    full_text = ""
    try:
        parser = LlamaParse(
            result_type="markdown",
            use_vendor_multimodal_model=True,
            invalidate_cache=True, # Critical for re-trying failed uploads
            language="en"
        )
        docs = parser.load_data(file_path)
        full_text = "\n".join([d.text for d in docs])
    except Exception as e:
        print(f"LlamaParse failed: {e}. Falling back to pdfplumber.")
        
    if not full_text.strip():
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                pages = [page.extract_text() or "" for page in pdf.pages]
                full_text = "\n".join(pages)
        except Exception as e:
            return {"error": f"pdfplumber extraction failed: {str(e)}"}
            
    if not full_text.strip():
        return {"error": "Extraction empty. Try re-saving the PDF."}
        
    try:
        meta = extract_metadata_regex(full_text)
        content = extract_content_with_gemini(full_text)
        if "error" in content:
            return {"error": f"AI Parsing failed: {content['error']}"}
            
        save_to_chromadb(content, meta, user_id)
        
        return {"status": "success", "contact_info": meta, "parsed_content": content}
    except Exception as e:
        return {"error": f"Processing failed: {str(e)}"}