// True for ScarletMail and other rutgers.edu addresses, matching the rule in supabase/ratings_and_email.sql
export const isRutgersEmail = (email) => /@(scarletmail\.)?rutgers\.edu$/i.test(email.trim())
