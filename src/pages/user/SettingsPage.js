import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext'; // ✅ Import the useAuth hook
import { post } from '../../lib/api'; // Keep this for the apply-organizer call

export default function SettingsPage({ navigation }) {
    // ✅ Get user, loading state, and logout function from the global context
    const { user, isLoading, logout, refreshUser} = useAuth();

    // The handleApplyForOrganizer logic can stay, but we use the context's user
    async function handleApplyForOrganizer() {
        try {
            const response = await post('/api/users/apply-organizer', {});
            Alert.alert('Success', response.message);
            // You may need a way to refresh the user context after this,
            // or the user can re-login to see the change.
            await refreshUser(); 
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    }
    
    // Logout is now a single call to the context function
    async function handleLogout() {
        await logout();
        // No navigation needed! App.js will automatically show the Login screen.
    }
    
    const renderOrganizerButton = () => {
        if (isLoading && !user) {
            return <ActivityIndicator size="small" color="#0000ff" />;
        }
        if (!user) return null; // User data comes from the context

        if (user.role === 'USER' && !user.organizerRequestPending) {
            return (
                <TouchableOpacity
                    className="bg-blue-600 px-6 py-3 rounded-xl mt-8"
                    onPress={handleApplyForOrganizer}
                >
                    <Text className="text-white font-semibold text-center">Apply to be an Organizer</Text>
                </TouchableOpacity>
            );
        }

        if (user.organizerRequestPending) {
            return <Text className="text-center text-gray-500 mt-8">Your application is pending review.</Text>;
        }
        
        if (user.role === 'ORGANIZER') {
            return <Text className="text-center text-green-600 mt-8">You are an Organizer!</Text>;
        }

        return null; // Don't show for ADMINs
    };

    return (
        <View className="flex-1 bg-white px-6 py-8">
            <Text className="text-2xl font-bold mb-6">Settings</Text>

            {renderOrganizerButton()}

            <TouchableOpacity
                className="bg-red-600 px-6 py-3 rounded-xl mt-auto"
                onPress={handleLogout}
            >
                <Text className="text-white font-semibold text-center">Logout</Text>
            </TouchableOpacity>
        </View>
    );
}