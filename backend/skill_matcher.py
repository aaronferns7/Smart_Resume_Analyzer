import os
import json
import logging
from typing import List, Dict

try:
    import google.generativeai as genai
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.prompts import PromptTemplate
    from langchain_core.output_parsers import JsonOutputParser
    from pydantic import BaseModel, Field
except ImportError:
    pass

logger = logging.getLogger(__name__)

class SkillMatchResult(BaseModel):
    matched: List[str] = Field(description="List of skills from the Job Description that the candidate contextually possesses.")
    missing: List[str] = Field(description="List of skills from the Job Description that the candidate completely lacks contextually.")

def contextually_match_skills(candidate_skills: List[str], job_skills_str: str) -> Dict[str, List[str]]:
    """
    Takes candidate's raw skills list and job's required skills string.
    Uses Gemini API to contextually match and separate job skills into 'matched' and 'missing'.
    """
    if not job_skills_str or not candidate_skills:
        # Fallback if no data provided
        return {"matched": [], "missing": [s.strip() for s in job_skills_str.split(",") if s.strip()]}

    try:
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("No GOOGLE_API_KEY found")

        model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0, google_api_key=api_key)
        parser = JsonOutputParser(pydantic_object=SkillMatchResult)
        
        template = (
            "You are an expert technical recruiter AI. Your task is to perform contextual skill matching.\n\n"
            "CANDIDATE'S EXTRACTED SKILLS:\n{candidate_skills}\n\n"
            "JOB'S REQUIRED SKILLS:\n{job_skills}\n\n"
            "INSTRUCTIONS:\n"
            "Categorize every single skill listed in the JOB'S REQUIRED SKILLS into exactly one of two lists: 'matched' or 'missing'.\n"
            "- A job skill goes into 'matched' if the candidate possesses it either explicitly or contextually "
            "(e.g., if job requires 'HTML/CSS' or 'ReactJS' and candidate has 'Frontend Development' or 'React').\n"
            "- A job skill goes into 'missing' if there is no contextual evidence the candidate has experience with it.\n"
            "Ensure that every required job skill is accounted for in the output, use the original job skill terminology where possible.\n"
            "{format_instructions}\n"
        )
        
        prompt = PromptTemplate(
            template=template,
            input_variables=["candidate_skills", "job_skills"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )
        
        chain = prompt | model | parser
        
        result = chain.invoke({
            "candidate_skills": ", ".join(candidate_skills),
            "job_skills": job_skills_str
        })
        
        return {
            "matched": result.get("matched", []),
            "missing": result.get("missing", [])
        }

    except Exception as e:
        logger.warning(f"Contextual Skill Matcher failed: {str(e)}")
        # Fallback to pure string subset logic if API is totally down
        req_skills = [s.strip().lower() for s in job_skills_str.split(",") if s.strip()]
        cand_skills_lower = [s.lower() for s in candidate_skills]
        matched, missing = [], []
        
        for js in req_skills:
            if any(cs in js or js in cs for cs in cand_skills_lower):
                matched.append(js)
            else:
                missing.append(js)
                
        return {"matched": matched, "missing": missing}
