import sqlite3
conn = sqlite3.connect('talentcortex.db')
c = conn.cursor()
c.execute("INSERT INTO jobs (hr_id, title, company, location, work_mode, skills, description) VALUES (10, 'Software Engineer', 'TechCorp', 'Remote', 'Remote', 'Python, Flask, React, SQL', 'We are looking for a full stack engineer.')")
c.execute("INSERT INTO jobs (hr_id, title, company, location, work_mode, skills, description) VALUES (10, 'Data Scientist', 'DataInc', 'New York', 'Onsite', 'Python, Machine Learning, Pandas, Scikit-learn', 'Looking for an experienced Data Scientist.')")
conn.commit()
print("Sample jobs inserted successfully.")
