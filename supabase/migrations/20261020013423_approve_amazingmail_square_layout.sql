-- Owner-authorized reservation approval for the existing, immutable square_v1 geometry.
-- Does not open campaigns, alter slots, approve final artwork, or enable collection.
-- All coordinates below refer to the upload file origin; SQL slots retain trim coordinates.
insert into private.approved_layout_templates (template_key, approval_reference)
values (
  'amazingmail-9x6-ten-square-draft',
  'Owner-approved reservation layout: AmazingMail/Xpressdocs 566132, 9x6 landscape trim, 9.125x6.125 upload, 8.75x5.75 centered live area. Ten exact 2.5x2.5 paid squares (F1-F6, B1-B4); lower-right 3.925x3.33 postal exclusion anchored to upload edges at (5.2,2.795). Two 3.7375x1.30375 house regions above postal area. Zero paid gutters; 0.0125 inch paid/postal clearance; lower house edge touches postal boundary. Geometry verified in tests/amazingmail-geometry.test.ts. Owner request: Finalize and Approve Square Layout for Reservations, 2026-10-19. Reservation approval only; not final house-artwork or print-proof approval.'
);
