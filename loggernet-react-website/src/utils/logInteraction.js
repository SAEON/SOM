// export async function logInteraction(interactionType, additionalData = {}, user = null) {
//     try {
//         // Get the user from localStorage or use the passed user object
//         const storedUser = JSON.parse(localStorage.getItem('user'));
//         const userId = user?.id || storedUser?.id || user?.userId || storedUser?.userId || null;
//
//         // console.log("testing id: " , userId);
//
//         // Fetch the user's IP address
//         const ipResponse = await fetch('https://api.ipify.org?format=json');
//         const ipData = await ipResponse.json();
//         const userIp = ipData.ip;
//
//         function getSASTTimestamp() {
//             const date = new Date();
//             const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
//             const sastTime = new Date(utcTime + 2 * 3600000);
//             return sastTime.toISOString();
//         }
//
//         const interactionData = {
//             ip: userIp,
//             interaction_type: interactionType,
//             request_path: window.location.pathname,
//             referrer: document.referrer,
//             user_agent: navigator.userAgent,
//             status_code: 200,
//             response_size: 0,
//             additional_data: JSON.stringify(additionalData),
//             session_id: sessionStorage.getItem('session_id') || generateSessionId(),
//             user_id: userId, // Correctly use the `id` property
//             timestamp: getSASTTimestamp(),
//         };
//
//         if (!sessionStorage.getItem('session_id')) {
//             sessionStorage.setItem('session_id', interactionData.session_id);
//         }
//
//         const response = await fetch('/api/check_and_log_interaction', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify(interactionData),
//         });
//
//
//         // console.log('Server response status:', response.status);
//     } catch (error) {
//         console.error('Error logging interaction:', error);
//     }
// }
//
// // Function to generate a session ID if not already present
// function generateSessionId() {
//     return 'xxxx-xxxx-xxxx-xxxx'.replace(/[x]/g, function() {
//         return Math.floor(Math.random() * 16).toString(16);
//     });
// }
export async function logInteraction(interactionType, additionalData = {}, user = null) {
    try {
        // Get the user from localStorage or use the passed user object
        const storedUser = JSON.parse(localStorage.getItem('user'));
        const userId = user?.id || storedUser?.id || user?.userId || storedUser?.userId || null;

        if (!userId) {
            console.warn("No user ID found for logging interaction.");
            return;
        }

        // Fetch the user's IP address
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const userIp = ipData.ip;

        // Generate SAST timestamp
        function getSASTTimestamp() {
            const date = new Date();
            const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
            const sastTime = new Date(utcTime + 2 * 3600000); // SAST is UTC+2
            return sastTime.toISOString();
        }

        const interactionData = {
            ip: userIp,
            interaction_type: interactionType,
            request_path: window.location.pathname,
            referrer: document.referrer,
            user_agent: navigator.userAgent,
            status_code: 200,
            response_size: 0,
            additional_data: JSON.stringify(additionalData),
            session_id: sessionStorage.getItem('session_id') || generateSessionId(),
            user_id: userId,
            timestamp: getSASTTimestamp(),
        };

        // Store the session ID if it's not already present
        if (!sessionStorage.getItem('session_id')) {
            sessionStorage.setItem('session_id', interactionData.session_id);
        }

        // console.log("Sending interaction data:", interactionData); // For debugging

        // Send interaction data to the server
        const response = await fetch('/api/check_and_log_interaction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(interactionData),
        });

        if (!response.ok) {
            throw new Error(`Failed to log interaction. Status: ${response.status}`);
        }

        console.log('Interaction logged successfully:', response.status);
    } catch (error) {
        console.error('Error logging interaction:', error);
    }
}

// Function to generate a session ID if not already present
function generateSessionId() {
    return 'xxxx-xxxx-xxxx-xxxx'.replace(/[x]/g, function() {
        return Math.floor(Math.random() * 16).toString(16);
    });
}
