export const getUserRole = () => {
    // Implement logic to get the current user's role
    // This could be from a JWT token, user context, or API call
    // For demonstration purposes, let's return 'Admin' or 'Non-Admin'
    return localStorage.getItem('userRole') || 'Non-Admin';
};

// Optionally, add more authentication-related functions here
