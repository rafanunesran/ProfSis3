# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Teachers (professores) and school managers (gestores) in São Paulo state public schools, plus AEE and project staff. They use it at school and at home, on computers and phones in roughly equal measure (confirmed). A super admin manages schools and accounts.

## Product Purpose
SisProf (ProfSis3) is an auxiliary school notebook: classes, students, attendance, grades, occurrences, tutoring, lesson plans, AEE annexes, agenda and file tools. It exists so a teacher can keep daily school work in one place. Records are auxiliary, not official; official entries are always made manually in the SEDUC systems.

## Positioning
Student personal data stays on the device or goes to the cloud only encrypted. File tools (PDF, image enlarging, posters) run entirely in the browser, so a child's file never goes to a third-party server.

## Operating Context
- Vanilla HTML/CSS/JS single page (`index.html` + `styles.css` + feature scripts), Firebase backend, deployed to GitHub Pages; also wrapped as an Android WebView app.
- Most UI is generated from JS template strings with inline styles.
- Views: Professor, Gestor, AEE, Projeto (switchable by gestores), and Super Admin.

## Capabilities and Constraints
- Functions and all teacher/manager data must never change during visual work (confirmed).
- The six color themes in Perfil (Padrão, Natureza, Pôr do Sol, Oceano, Cyber, Modo Escuro) and the custom background image must keep working (confirmed).
- Printed reports and exported documents are real deliverables; print output must stay clean.

## Brand Commitments
Name "SisProf"; school name and logo can replace the header title per school. Portuguese (pt-BR) throughout.

## Product Principles
- The teacher's time in class is scarce: the task comes first, decoration never blocks it.
- Never lose or expose student data; safety messages must be seen and understood.
- Works the same on a school computer and on a phone.

## Accessibility & Inclusion
No formal standard recorded. Target WCAG AA contrast and visible keyboard focus.
