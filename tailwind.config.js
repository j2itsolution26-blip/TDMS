import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', ...defaultTheme.fontFamily.sans],
            },
            colors: {
                navy: {
                    DEFAULT: '#0F172A',
                    50: '#F8FAFC',
                    100: '#E2E8F0',
                    200: '#CBD5E1',
                    300: '#94A3B8',
                    400: '#64748B',
                    500: '#334155',
                    600: '#1E293B',
                    700: '#172033',
                    800: '#131B2C',
                    900: '#0F172A',
                    950: '#0B1220',
                },
                indigo: {
                    DEFAULT: '#4F46E5',
                    50: '#EEF2FF',
                    100: '#E0E7FF',
                    200: '#C7D2FE',
                    300: '#A5B4FC',
                    400: '#818CF8',
                    500: '#6366F1',
                    600: '#4F46E5',
                    700: '#4338CA',
                    800: '#3730A3',
                    900: '#312E81',
                },
                brand: {
                    blue: '#2563EB',
                },
                surface: '#F8FAFC',
                card: '#FFFFFF',
                border: '#E2E8F0',
                success: '#16A34A',
                warning: '#D97706',
                danger: '#DC2626',
                info: '#2563EB',
            },
        },
    },

    plugins: [forms],
};
