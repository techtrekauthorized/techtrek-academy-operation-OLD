# Attendance Form Backfill Dry Run Report

## Summary
- Workbook readable: Yes
- Required sheets found: Yes
- Processed rows: 2384
- Exact unique raw Session Group + Student ID pairs: 2321
- Duplicate raw submissions removed: 61
- Rows accepted despite late/outside timing: 41
- Rows unresolved because Session Group is NEEDS REVIEW: 2
- Exact session code/date matches: 2237
- Session review required: 86
- Exact University Student ID matches: 2189
- Safe name+phone fallback matches: 7
- Student review required: 36
- Identity conflicts: 5
- Eligible mapped enrollments: 2171
- No eligible mapping: 22
- Multiple eligible enrollments: 3
- CREATE_VALIDATED count: 1462
- UPDATE_EXISTING count: 106
- ALREADY_PRESENT count: 583
- DUPLICATE_VALIDATED_REVIEW count: 20
- Source response rows unresolved: 1536
- Total final unique Present candidates: 2151
- Google Sheets OAuth scope: https://www.googleapis.com/auth/spreadsheets.readonly
- Google Sheets writes performed: 0
- Final result: READY FOR APPLY REVIEW
- Remaining issue: None

## Live Sheets Read
- Sheets read: Students, Enrollments, Groups, Attendance_Sessions, Attendance_Session_Groups, Attendance_Validated, Attendance_Form_Responses

## Compact Breakdown by Attendance_Session_ID
| Attendance_Session_ID | Candidate present count | Already present | Create | Update | Review required |
| --- | ---: | ---: | ---: | ---: | ---: |
| ASCH_00001 | 51 | 12 | 37 | 1 | 4 |
| ASCH_00002 | 60 | 58 | 1 | 0 | 2 |
| ASCH_00003 | 42 | 30 | 0 | 5 | 9 |
| ASCH_00004 | 60 | 57 | 2 | 1 | 0 |
| ASCH_00005 | 27 | 23 | 2 | 0 | 4 |
| ASCH_00006 | 60 | 58 | 2 | 0 | 3 |
| ASCH_00007 | 77 | 50 | 0 | 25 | 6 |
| ASCH_00008 | 30 | 22 | 7 | 0 | 4 |
| ASCH_00009 | 38 | 35 | 3 | 0 | 1 |
| ASCH_00011 | 64 | 42 | 3 | 18 | 1 |
| ASCH_00012 | 100 | 40 | 2 | 55 | 7 |
| ASCH_00013 | 67 | 60 | 5 | 1 | 4 |
| ASCH_00014 | 52 | 43 | 8 | 0 | 4 |
| ASCH_00015 | 55 | 53 | 2 | 0 | 0 |
| ASCH_00016 | 67 | 0 | 67 | 0 | 4 |
| ASCH_00017 | 88 | 0 | 88 | 0 | 4 |
| ASCH_00018 | 139 | 0 | 139 | 0 | 3 |
| ASCH_00019 | 62 | 0 | 62 | 0 | 4 |
| ASCH_00021 | 88 | 0 | 88 | 0 | 2 |
| ASCH_00022 | 155 | 0 | 155 | 0 | 3 |
| ASCH_00023 | 56 | 0 | 56 | 0 | 2 |
| ASCH_00024 | 47 | 0 | 47 | 0 | 2 |
| ASCH_00025 | 55 | 0 | 55 | 0 | 2 |
| ASCH_00026 | 73 | 0 | 73 | 0 | 0 |
| ASCH_00028 | 61 | 0 | 61 | 0 | 2 |
| ASCH_00029 | 46 | 0 | 46 | 0 | 2 |
| ASCH_00030 | 51 | 0 | 51 | 0 | 0 |
| ASCH_00031 | 63 | 0 | 63 | 0 | 1 |
| ASCH_00032 | 1 | 0 | 1 | 0 | 0 |
| ASCH_00033 | 152 | 0 | 152 | 0 | 1 |
| ASCH_00035 | 46 | 0 | 46 | 0 | 3 |
| ASCH_00037 | 138 | 0 | 138 | 0 | 2 |

## Diagnostic Examples
### SESSION_REVIEW_REQUIRED
- Original Row 353 | University Student ID 222 | NEEDS REVIEW | Session Group requires review.
- Original Row 696 | University Student ID 2405832 | NEEDS REVIEW | Session Group requires review.
- Original Row 701 | University Student ID 24030086 | 292103 | 2026-07-23 | Code/date did not match a live session.
- Original Row 702 | University Student ID 24030195 | 292103 | 2026-07-23 | Code/date did not match a live session.
- Original Row 703 | University Student ID 2403247475 | 292103 | 2026-07-23 | Code/date did not match a live session.
- Original Row 704 | University Student ID 2305258 | 292103 | 2026-07-23 | Code/date did not match a live session.
- Original Row 705 | University Student ID 2403244945 | 292103 | 2026-07-23 | Code/date did not match a live session.
- Original Row 706 | University Student ID 24030190 | 292103 | 2026-07-23 | Code/date did not match a live session.
- Original Row 707 | University Student ID 24030265 | 292103 | 2026-07-23 | Code/date did not match a live session.
- Original Row 708 | University Student ID 2305330 | 292103 | 2026-07-23 | Code/date did not match a live session.

### STUDENT_REVIEW_REQUIRED
- Original Row 31 | University Student ID ANU | ASCH_00003 | Student identity was not uniquely resolved.
- Original Row 66 | University Student ID AIET | ASCH_00001 | Student identity was not uniquely resolved.
- Original Row 108 | University Student ID AMEENHUSSENY24030047 | ASCH_00005 | Student identity was not uniquely resolved.
- Original Row 265 | University Student ID 90192069 | ASCH_00007 | Student identity was not uniquely resolved.
- Original Row 296 | University Student ID 2406230 | ASCH_00008 | Student identity was not uniquely resolved.
- Original Row 313 | University Student ID 2406258678 | ASCH_00008 | Student identity was not uniquely resolved.
- Original Row 329 | University Student ID امينحسينيولدعبدالحميد.24030047 | ASCH_00009 | Student identity was not uniquely resolved.
- Original Row 518 | University Student ID 23011601 | ASCH_00012 | Student identity was not uniquely resolved.
- Original Row 579 | University Student ID 2401244990 | ASCH_00014 | Student identity was not uniquely resolved.
- Original Row 598 | University Student ID 23030093 | ASCH_00014 | Student identity was not uniquely resolved.

### IDENTITY_CONFLICT
- Original Row 780 | University Student ID 2406248751 | ASCH_00013 | Name matches a different database student.
- Original Row 1068 | University Student ID 2406248751 | ASCH_00016 | Name matches a different database student.
- Original Row 1636 | University Student ID 2406248751 | ASCH_00019 | Name matches a different database student.
- Original Row 1827 | University Student ID 2406248751 | ASCH_00028 | Name matches a different database student.
- Original Row 2133 | University Student ID 2406248751 | ASCH_00031 | Name matches a different database student.

### NO_ELIGIBLE_SESSION_MAPPING
- Original Row 10 | University Student ID 2307242 | ASCH_00003 | No active enrollment has an active group mapping for this session.
- Original Row 48 | University Student ID 2305180 | ASCH_00001 | No active enrollment has an active group mapping for this session.
- Original Row 74 | University Student ID 2305007 | ASCH_00001 | No active enrollment has an active group mapping for this session.
- Original Row 115 | University Student ID 2305383 | ASCH_00005 | No active enrollment has an active group mapping for this session.
- Original Row 146 | University Student ID 2505366 | ASCH_00002 | No active enrollment has an active group mapping for this session.
- Original Row 205 | University Student ID 2305258 | ASCH_00007 | No active enrollment has an active group mapping for this session.
- Original Row 213 | University Student ID 2307242 | ASCH_00007 | No active enrollment has an active group mapping for this session.
- Original Row 215 | University Student ID 24030160 | ASCH_00007 | No active enrollment has an active group mapping for this session.
- Original Row 284 | University Student ID 24030179 | ASCH_00008 | No active enrollment has an active group mapping for this session.
- Original Row 401 | University Student ID 2505366 | ASCH_00006 | No active enrollment has an active group mapping for this session.

### MULTIPLE_ELIGIBLE_ENROLLMENTS
- Original Row 390 | University Student ID 23030099 | ASCH_00006 | Multiple active enrollments are mapped to this session.
- Original Row 1125 | University Student ID 23030099 | ASCH_00017 | Multiple active enrollments are mapped to this session.
- Original Row 1601 | University Student ID 23030099 | ASCH_00021 | Multiple active enrollments are mapped to this session.

### DUPLICATE_VALIDATED_REVIEW
- Original Row 2 | University Student ID 2405757 | ASCH_00003 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 3 | University Student ID 2405736 | ASCH_00003 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 4 | University Student ID 2305390 | ASCH_00003 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 5 | University Student ID 2405730 | ASCH_00003 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 6 | University Student ID 2405764 | ASCH_00003 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 7 | University Student ID 2305392 | ASCH_00003 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 38 | University Student ID 900212707 | ASCH_00003 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 54 | University Student ID 2405257 | ASCH_00001 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 125 | University Student ID 2204296 | ASCH_00005 | Multiple Attendance_Validated rows exist for this student/session.
- Original Row 132 | University Student ID 2507516 | ASCH_00005 | Multiple Attendance_Validated rows exist for this student/session.

### SOURCE_ROW_UNRESOLVED
- Original Row 3 | University Student ID 2405736 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 4 | University Student ID 2305390 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 6 | University Student ID 2405764 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 8 | University Student ID 2305384 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 11 | University Student ID 2305315 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 12 | University Student ID 2305412 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 13 | University Student ID 2405411 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 16 | University Student ID 2305268 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 18 | University Student ID 2204084 | ASCH_00003 | Live source response row was not uniquely resolved.
- Original Row 20 | University Student ID 2305287 | ASCH_00003 | Live source response row was not uniquely resolved.

## Blocking Issues
- None

## Confirmation
- This was a read-only dry run.
- Attendance_Form_Responses was not modified.
- Attendance_Validated was not modified.
- Google Sheets writes performed: 0
