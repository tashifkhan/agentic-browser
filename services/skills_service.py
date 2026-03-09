import os
import yaml
from typing import List, Dict, Any, Optional

SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skills")

def get_skills_dir() -> str:
    """Ensure skills directory exists and return its path."""
    if not os.path.exists(SKILLS_DIR):
        os.makedirs(SKILLS_DIR)
    return SKILLS_DIR

def parse_skill_markdown(filepath: str) -> dict:
    """Parse SKILL.md file with YAML frontmatter."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Parse YAML frontmatter if it exists
    metadata = {
        "name": os.path.basename(os.path.dirname(filepath)),  # default to folder name
        "description": ""
    }
    
    # Look for frontmatter
    if content.startswith("---\n"):
        end_idx = content.find("\n---\n", 4)
        if end_idx != -1:
            try:
                yaml_content = content[4:end_idx]
                parsed = yaml.safe_load(yaml_content)
                if isinstance(parsed, dict):
                    metadata.update(parsed)
            except Exception as e:
                pass # Valid to fail if YAML is malformed
    
    return metadata

def list_all_skills() -> List[Dict[str, Any]]:
    """Scan the skills directory and return metadata for all valid skills."""
    skills_dir = get_skills_dir()
    skills = []
    
    for folder_name in os.listdir(skills_dir):
        folder_path = os.path.join(skills_dir, folder_name)
        if not os.path.isdir(folder_path):
            continue
            
        skill_md_path = os.path.join(folder_path, "SKILL.md")
        if os.path.exists(skill_md_path):
            metadata = parse_skill_markdown(skill_md_path)
            skills.append({
                "id": folder_name,
                "name": metadata.get("name", folder_name),
                "description": metadata.get("description", ""),
                "path": skill_md_path
            })
            
    return skills

def get_skill_content_by_name(skill_name: str) -> Optional[str]:
    """Find a skill by its human-readable name or ID and return its SKILL.md content."""
    skills = list_all_skills()
    
    target_skill = None
    # exact match by name
    for skill in skills:
        if skill["name"].lower().strip() == skill_name.lower().strip() or skill["id"].lower().strip() == skill_name.lower().strip():
            target_skill = skill
            break
            
    if not target_skill:
        return None
        
    try:
        with open(target_skill["path"], "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None
