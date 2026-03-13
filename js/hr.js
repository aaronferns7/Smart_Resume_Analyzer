document.addEventListener("DOMContentLoaded", () => {

const jobForm = document.getElementById("jobForm");
const jobList = document.getElementById("jobList");

let jobs = JSON.parse(localStorage.getItem("jobs")) || [];

function renderJobs(){

if(jobs.length === 0){
jobList.innerHTML = "<p>No jobs posted yet.</p>";
return;
}

jobList.innerHTML = "";

jobs.forEach((job,index)=>{

const div = document.createElement("div");
div.classList.add("job-card");

div.innerHTML = `
<h3>${job.title}</h3>
<p><strong>Company:</strong> ${job.company}</p>
<p><strong>Location:</strong> ${job.location}</p>

<div class="job-actions">
<a href="results.html" class="secondary-btn">View Applicants</a>
</div>
`;

jobList.appendChild(div);

});

}

renderJobs();

if(jobForm){

jobForm.addEventListener("submit",(e)=>{

e.preventDefault();

const newJob = {

title: document.getElementById("jobTitle").value,
company: document.getElementById("company").value,
location: document.getElementById("location").value,
mode: document.getElementById("workMode").value,
skills: document.getElementById("skills").value,
description: document.getElementById("description").value

};

jobs.push(newJob);

localStorage.setItem("jobs",JSON.stringify(jobs));

jobForm.reset();

renderJobs();

});

}

});