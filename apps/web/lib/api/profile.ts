import { axiosInstance } from './axios';
import type { UserProfile, UpdateAvatarResponse } from '@/types/profile.ts';

export const profileApi = {
    /**
     * GET /auth/profile
     * Returns the authenticated user's full profile details.
     */
    getProfile: async (): Promise<UserProfile> => {
        const { data } = await axiosInstance.get<UserProfile>('/auth/profile');
        return data;
    },

    /**
     * PATCH /auth/profile/avatar
     * Uploads a new profile picture.
     */
    updateAvatar: async (file: File): Promise<UpdateAvatarResponse> => {
        const formData = new FormData();
        formData.append('avatar', file);

        const { data } = await axiosInstance.patch<UpdateAvatarResponse>(
            '/auth/profile/avatar',
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        );
        return data;
    },
};
