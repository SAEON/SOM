import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {logInteraction} from "../utils/logInteraction";

const AdminPanel = ({ user }) => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [interactions, setInteractions] = useState([]);  // Add state for interactions

    useEffect(() => {
        const fetchUsersAndRolesAndInteractions = async () => {
            try {
                const [usersResponse, rolesResponse, interactionsResponse] = await Promise.all([
                    axios.get('/api/users'),
                    axios.get('/api/roles'),
                    axios.get('/api/interactions') // Fetch interactions
                ]);
                setUsers(usersResponse.data);
                setRoles(rolesResponse.data);
                setInteractions(interactionsResponse.data); // Set interactions state
            } catch (error) {
                console.error('Error fetching users, roles, and interactions:', error);
            }
        };

        fetchUsersAndRolesAndInteractions();
    }, []);


    // useEffect(() => {// Log the interaction whether the user is logged in or not
    //     logInteraction('page_view', { viewport: { width: window.innerWidth, height: window.innerHeight } }, user);
    // }, [user]);

    // useEffect(() => {
    //     const fetchUsersAndRoles = async () => {
    //         try {
    //             const [usersResponse, rolesResponse] = await Promise.all([
    //                 axios.get('/api/users'),
    //                 axios.get('/api/roles')
    //             ]);
    //             setUsers(usersResponse.data);
    //             setRoles(rolesResponse.data);
    //         } catch (error) {
    //             console.error('Error fetching users and roles:', error);
    //         }
    //     };
    //
    //     fetchUsersAndRoles();
    // }, []);

    const handleRoleChange = async (userId, roleId) => {
        try {
            await axios.post('/api/user_roles', { userId, roleId });
            // Update the users state to reflect the change
            setUsers(prevUsers =>
                prevUsers.map(user => (user.id === userId ? { ...user, role_id: roleId } : user))
            );
        } catch (error) {
            console.error('Error updating role:', error);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (userId === user.id) {
            alert("You cannot delete the currently logged-in user.");
            return;
        }

        const confirmDelete = window.confirm("Are you sure you want to delete this user?");
        if (!confirmDelete) return;

        try {
            await axios.delete(`/api/users/${userId}`);
            setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
        } catch (error) {
            console.error('Error deleting user:', error);
        }
    };

    return (
        <div>
            <h1>Admin Panel</h1>
            <table>
                <thead>
                <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Country</th>
                    <th>Role</th>
                    <th>Change Role</th>
                    <th>Delete User</th>
                </tr>
                </thead>
                <tbody>
                {users.map(user => (
                    <tr key={user.id}>
                        <td>{user.username}</td>
                        <td>{user.email}</td>
                        <td>{user.first_name}</td>
                        <td>{user.last_name}</td>
                        <td>{user.country}</td>
                        <td>{roles.find(role => role.id === user.role_id)?.name}</td>
                        <td>
                            <select
                                value={user.role_id}
                                onChange={e => handleRoleChange(user.id, e.target.value)}
                                disabled={user.id === user.id} // Disable role change for the currently logged-in user
                            >
                                {roles.map(role => (
                                    <option key={role.id} value={role.id}>
                                        {role.name}
                                    </option>
                                ))}
                            </select>
                        </td>
                        <td>
                            <button onClick={() => handleDeleteUser(user.id)} disabled={user.id === user.id}>
                                Delete
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
            {/* Interactions Table */}
            <h2>Latest Interactions</h2>
            <table>
                <thead>
                <tr>
                    <th>User ID</th>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Interaction Type</th>
                    <th>Request Path</th>
                    <th>Timestamp</th>
                </tr>
                </thead>
                <tbody>
                {interactions.map(interaction => (
                    <tr key={interaction.interaction_id}>
                        <td>{interaction.user_id}</td>
                        <td>{interaction.first_name}</td>
                        <td>{interaction.last_name}</td>
                        <td>{interaction.interaction_type}</td>
                        <td>{interaction.request_path}</td>
                        <td>{new Date(interaction.timestamp).toLocaleString()}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
};

export default AdminPanel;
