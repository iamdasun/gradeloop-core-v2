export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  role_name: string;
  user_type: "student" | "employee" | "all";
  faculty?: string;
  department?: string;
  student_id?: string;
  designation?: string;
  is_active: boolean;
  created_at: string;
}

export interface UpdateAvatarResponse {
  avatar_url: string;
  message: string;
}
