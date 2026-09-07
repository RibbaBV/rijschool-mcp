/**
 * Welke velden deze server uitgeeft.
 *
 * LICHT is de lijst voor een resultaatlijst, VOL die voor één rijschool. Alles
 * wat er niet in staat, geeft deze server niet terug.
 */
export const LICHT = [
  'id', 'name', 'city', 'service_province', 'lat', 'lon',
  'success_percentage', 'success_percentage_first', 'total_exams', 'total_exams_first',
  'location_avg_percentage', 'stats_exam_type',
  'vanaf_price', 'google_rating', 'google_reviews_count',
  'automatic_transmission_lessons', 'theory_lessons', 'practical_lessons',
  'website', 'email', 'phone1',
].join(',');

export const VOL = [
  'id', 'name', 'city', 'service_province', 'service_areas', 'lat', 'lon',
  'street_name', 'house_number', 'house_number_extension', 'zip_code', 'contact_city',
  'phone1', 'phone2', 'email', 'website',
  'kvk', 'driving_school_number', 'trade_associations',
  'success_percentage', 'success_percentage_first', 'success_percentage_retake',
  'total_exams', 'total_exams_first', 'total_exams_retake',
  'location_avg_percentage', 'stats_exam_type', 'exam_types',
  'vanaf_price', 'pricing_json', 'pricing_url',
  'google_rating', 'google_reviews_count', 'google_reviews_link', 'google_place_id',
  'google_opening_hours', 'google_business_status', 'google_verified', 'google_category',
  'automatic_transmission_lessons', 'custom_car_lessons', 'theory_lessons', 'practical_lessons',
  'page_consent_at', 'scraped_at',
].join(',');

export type SchoolLicht = {
  id: number;
  name: string;
  city: string | null;
  service_province: string | null;
  lat: number | null;
  lon: number | null;
  success_percentage: number | null;
  success_percentage_first: number | null;
  total_exams: number | null;
  total_exams_first: number | null;
  location_avg_percentage: number | null;
  stats_exam_type: string | null;
  vanaf_price: number | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  automatic_transmission_lessons: boolean | null;
  theory_lessons: boolean | null;
  practical_lessons: boolean | null;
  website: string | null;
  email: string | null;
  phone1: string | null;
};
