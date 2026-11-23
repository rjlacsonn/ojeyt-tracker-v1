# OJeyT Tracker — Tagalog Presentation Script

**Tinatayang oras:** 7–10 minuto

## 1. Pagbati at pagpapakilala

Magandang araw po, Professor. Ang ipapakita ko po ay ang **OJeyT Tracker**, isang web-based system na ginawa para mapadali ang pag-monitor ng On-the-Job Training ng mga estudyante.

Ang pangunahing layunin ng system ay pagsamahin sa iisang platform ang pagre-record ng duty hours, pag-monitor ng progress, pagpasa ng OJT requirements, at pag-review ng professor o coordinator. Sa halip na magkahiwalay ang attendance record, progress computation, at documents, makikita at magagamit ang mga ito sa isang account.

## 2. Mga user ng system

May dalawang pangunahing uri ng user ang system: **student** at **professor o OJT coordinator**.

Magkaiba ang pages at permissions na nakikita ng bawat role. Ang student ay may access sa Dashboard, History, Documents, Badges, at Settings. Ang professor naman ay may access sa Students, Review Submissions, Account, at Settings.

Ang role ng user ay kinukumpirma mula sa database at hindi lamang mula sa editable information sa browser. Ibig sabihin, hindi basta mapapalitan ng student ang account niya para maging professor.

## 3. Registration at coordinator code

Sa registration, hiwalay ang form para sa student at professor. Kapag professor ang gumawa ng account, nagkakaroon siya ng sariling **six-character coordinator code**, halimbawa `ABC123`.

Ise-share ng professor ang code na ito sa kanyang students. Kapag inilagay ng student ang valid code, automatic siyang makokonekta sa professor, magiging active agad ang tracker niya, at lalabas siya sa Students list ng professor.

Hindi na kailangan ng hiwalay na manual approval. Ang possession ng valid unique code ang nagsisilbing authorization para makasali ang student sa class list. Kapag mali o hindi existing ang code, hindi mabibigyan ng access ang student.

## 4. Student dashboard at pag-log ng duty

Pagkatapos ma-activate, mapupunta ang student sa Dashboard. Dito niya makikita ang total rendered hours, remaining hours, percentage of completion, total duty days, attendance streak, at estimated completion date.

Sa pag-save ng shift, required ang date, morning time-in, at morning time-out. Optional naman ang afternoon at overtime schedules. Automatic na kino-compute ng system ang duration ng bawat period at ang kabuuang oras.

May validation din ang system. Hindi puwedeng maglagay ng future date, baliktad na time-in at time-out, overlapping schedules, o duplicate shift sa parehong araw. Maaari ring maglagay ng notes o accomplishment para maitala kung ano ang ginawa ng student sa araw na iyon.

Puwedeng i-edit o burahin ng student ang sarili niyang shift record. Pagkatapos ng bawat pagbabago, automatic na nagre-recompute ang dashboard at progress.

## 5. History at progress monitoring

Sa History page, makikita ang lahat ng duty records kasama ang morning, afternoon, overtime, total hours, at notes. May daily view at monthly summary.

Sa monthly summary, ipinapakita ang total hours, number of days worked, average hours per day, at short days. May activity calendar din na nagpapakita kung kailan na-save ang mga shift record sa loob ng 90 o 365 days.

Ang required OJT hours ay hindi kayang baguhin ng student. Professor lamang ang puwedeng mag-assign o mag-update nito. Kapag nagtakda ang professor ng required hours, automatic na makikita ng student ang updated target, remaining hours, at completion percentage.

## 6. Professor side

Sa Students page, makikita ng professor ang kanyang coordinator code at lahat ng students na gumamit nito. Sa bawat student card, makikita ang assigned hours, logged hours, remaining hours, at completion percentage.

Dito rin maaaring magtakda ang professor ng required OJT hours ng bawat student. Ang professor ay makakakita lamang ng students na nakakonekta sa kanya, kaya hiwalay ang class list ng bawat coordinator.

Para sa malalaking klase, maaaring mag-search ang professor gamit ang pangalan o email ng student. Lalabas lamang ang **OJT Complete** kapag approved na ang lahat ng 10 requirements at kumpleto na rin ang assigned OJT hours. Pagkatapos nito, maaaring alisin ang card sa active roster gamit ang confirmation modal. Mananatiling ligtas ang account, hours, at document history, pero babalik ang student sa coordinator-code screen at kailangang kumonekta ulit bago magamit ang tracker.

Tinanggal ang manual approval step para mabawasan ang hassle sa professor. Kapag valid ang code na ginamit ng student, automatic siyang lalabas sa list at maaari nang gumamit ng tracker.

## 7. Gamification

May Badges and Achievements page din ang system para ma-engganyo ang students na maging consistent.

Nakakakuha ang student ng XP mula sa attendance days, accomplishments, streaks, full duty days, at percentage ng completed required hours. May anim na levels mula **New Intern** hanggang **Intern Champion**.

Ang rewards ay kino-compute mula sa actual saved shift records. Kapag may in-edit o binurang record, o nagbago ang required hours, automatic ding nagbabago ang XP at badge progress. Wala itong separate leaderboard at hindi puwedeng magdagdag ng XP manually.

## 8. OJT documents

Sa Documents page, maaaring mag-upload ang student ng requirements number 4 hanggang 13. Kasama rito ang application form, monitoring form, feedback paper, work pictures, waiver, certification, consent, at confidentiality agreement.

Tumatanggap ang system ng PDF, Word, Excel, JPG, at PNG files hanggang 10 MB bawat file. Ang bagong upload ay private draft muna. Hindi ito nakikita ng professor hangga't hindi pinipili ng student ang **Submit for review**.

Kapag submitted na, naka-lock muna ang file habang hinihintay ang review. Sa Review Submissions page, maaaring i-download ng professor ang file, i-approve ito, o ibalik para sa revision. Kapag ibinalik, required ang feedback para malinaw sa student kung ano ang kailangang ayusin.

Makikita rin ng professor ang document completion ng bawat student, bilang ng approved requirements, awaiting review, returned, at not submitted. May search at student filter para madaling mag-monitor kapag marami na ang records.

Ang files to review ay naka-group sa collapsible section ng bawat student. Makikita sa header ang pangalan, email, bilang ng files, at bilang ng awaiting review para hindi magkahalo ang sabay-sabay na submissions.

## 9. Security at data privacy

Ang system ay gumagamit ng **Supabase Authentication** para sa login at account management, **PostgreSQL database** para sa profiles, shifts, enrollment, at document records, at private **Supabase Storage** para sa uploaded files.

May Row Level Security o RLS. Dahil dito, sariling shift at profile lamang ang kayang basahin at baguhin ng student. Ang professor ay makakakita lamang ng students na konektado sa kanya at ng documents na officially submitted sa kanya. Hindi niya makikita ang private drafts ng student.

May server-side database functions din para sa coordinator connection, required-hours assignment, document submission, at review. Hindi lang interface ang nagva-validate; chine-check din ng database ang permissions bago tumanggap ng action.

## 10. Technologies na ginamit

Ang front end ay ginawa gamit ang **HTML, CSS, at vanilla JavaScript**. Single-page application ito, kaya mabilis ang paglipat sa iba't ibang pages nang hindi nire-reload ang buong website.

Responsive ang design para magamit sa desktop, laptop, tablet, at mobile phone. Ang backend services ay mula sa Supabase, habang ang website ay maaaring i-deploy sa Vercel at i-update sa pamamagitan ng GitHub.

May automated tests din ang project para sa registration, account access, student enrollment, document workflow, gamification, settings, startup behavior, at activity tracking. Layunin nitong mabawasan ang regression o pagkasira ng existing features kapag may bagong update.

## 11. Limitations at posibleng future improvements

Sa current version, wala pang automatic email o push notification kapag may bagong submission o returned document. Wala ring built-in blank school templates; ang student ang mag-a-upload ng completed files.

Ang holiday list na ginagamit sa streak computation ay kailangan ding i-review at i-update ayon sa official academic calendar ng institution.

Sa future, maaaring idagdag ang email notifications, report export to PDF o Excel, administrator dashboard, announcement system, at mas detalyadong analytics.

## 12. Suggested live demo

Para sa demo, una kong ipapakita ang professor account at ang six-character coordinator code. Pagkatapos, magla-login ako bilang student at ilalagay ang code para ipakita na automatic ang access at automatic ding lalabas ang student sa professor list.

Susunod, magse-save ako ng isang duty shift na may accomplishment. Ipapakita ko kung paano nagbabago ang total hours, progress, history, activity calendar, XP, at badges.

Pagkatapos, mag-a-upload ako ng sample document bilang student at ise-submit ito for review. Sa professor account, ipapakita ko ang pag-download, pag-return na may feedback, at pag-approve ng requirement.

Sa huli, ipapakita ko kung paano nag-a-assign ang professor ng required OJT hours at kung paano ito automatic na nakikita sa student dashboard.

## 13. Pangwakas

Sa kabuuan, ang OJeyT Tracker ay ginawa para maging mas organisado, transparent, at efficient ang OJT monitoring. Nakakatulong ito sa student na makita ang sariling progress at requirements, habang binibigyan naman nito ang professor ng isang central view para sa students, required hours, at document submissions.

Maraming salamat po. Handa po akong sagutin ang inyong mga tanong at tumanggap ng suggestions para sa susunod na improvement ng system.

## Maikling sagot sa posibleng tanong

**Bakit automatic ang access gamit ang code?**  
Unique sa bawat professor ang code. Layunin nitong alisin ang manual approval workload habang nananatiling kailangan ng student ang code bago makapasok sa class list.

**Paano kung maling code ang ilagay?**  
Hindi gagawa ng enrollment ang database at mananatiling unconnected ang student.

**Makikita ba ng professor ang draft documents?**  
Hindi. Submitted documents lamang ang puwedeng makita at i-review ng professor.

**Sino ang puwedeng magbago ng required hours?**  
Ang connected professor lamang. Read-only ito sa student side.

**Saan naka-save ang data?**  
Naka-save ang accounts at structured records sa Supabase database, at ang uploaded requirements ay nasa private Supabase Storage.

**Paano pinoprotektahan ang records?**  
Gumagamit ang system ng authentication, role-based navigation, Row Level Security, private storage policies, at server-side database functions.
