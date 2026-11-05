# Tasks & Grades Schema Report

Generated: 2026-08-10T13:27:50.726Z

## Read-only diagnostic

- Workbook readable: No
- Google Sheets OAuth scope: `https://www.googleapis.com/auth/spreadsheets.readonly`
- Google Sheets writes performed: 0
- Read error: Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user' of service 'sheets.googleapis.com' for consumer 'project_number:243437769157'.

## Existing assignment-related sheets found

No assignment, task, project, grade, assessment, academic-record, or certificate eligibility sheets were found in the live spreadsheet metadata.

## Required schema compatibility

| Required sheet | Found | Rows | Missing required fields |
| --- | --- | ---: | --- |
| Assignments | No | 0 | Assignment_ID, Batch_ID, Assignment_Type, Title, Description, Level_Code, Max_Grade, Required_For_Certificate, Is_Active, Created_At, Created_By, Notes |
| Assignment_Groups | No | 0 | Assignment_Group_Map_ID, Assignment_ID, Group_ID, Is_Active, Notes |
| Assignment_Results | No | 0 | Assignment_Result_ID, Assignment_ID, Academy_Student_ID, Enrollment_ID, Group_ID, Submission_Status, Grade, Graded_By, Graded_At, Notes, Updated_At |
| Certificate_Eligibility | No | 0 | Certificate_Eligibility_ID, Academy_Student_ID, Enrollment_ID, Batch_ID, Approval_Status, Approved_By, Approved_At, Updated_At, Notes |

## Proposed headers

### Assignments

- Assignment_ID
- Batch_ID
- Assignment_Type
- Title
- Description
- Level_Code
- Max_Grade
- Required_For_Certificate
- Is_Active
- Created_At
- Created_By
- Notes

### Assignment_Groups

- Assignment_Group_Map_ID
- Assignment_ID
- Group_ID
- Is_Active
- Notes

### Assignment_Results

- Assignment_Result_ID
- Assignment_ID
- Academy_Student_ID
- Enrollment_ID
- Group_ID
- Submission_Status
- Grade
- Graded_By
- Graded_At
- Notes
- Updated_At

### Certificate_Eligibility

- Certificate_Eligibility_ID
- Academy_Student_ID
- Enrollment_ID
- Batch_ID
- Approval_Status
- Approved_By
- Approved_At
- Updated_At
- Notes

## Required relationships

- `Assignments.Batch_ID` must reference `Batches.Batch_ID`.
- `Assignment_Groups.Assignment_ID` must reference `Assignments.Assignment_ID`.
- `Assignment_Groups.Group_ID` must reference `Groups.Group_ID`.
- `Assignment_Results.Assignment_ID` must reference `Assignments.Assignment_ID`.
- `Assignment_Results.Academy_Student_ID` must reference `Students.Academy_Student_ID`.
- `Assignment_Results.Enrollment_ID` must reference `Enrollments.Enrollment_ID`.
- `Assignment_Results.Group_ID` must match the student's eligible enrollment group and an active assignment-group mapping.
- `Certificate_Eligibility.Enrollment_ID` should be unique for the current one-program-certificate-per-enrollment workflow.

## Data migration impact

- Production schema creation is required before the internal Tasks & Grades runtime can be safely implemented.
- No student-facing Tasks & Grades, grade display, certificate readiness, certificate generation, QR codes, or public verification should be enabled from this report alone.
- Existing Students, Enrollments, Groups, Payments, Attendance, Recordings, Materials, and Certificates data are unchanged.

## Final result

BLOCKED_FOR_SCHEMA_APPLY

## Remaining issue

Required production sheets/columns for Assignments, Assignment_Groups, Assignment_Results, and Certificate_Eligibility are missing or incomplete. Apply a reviewed schema migration before building the runtime Tasks & Grades module.
