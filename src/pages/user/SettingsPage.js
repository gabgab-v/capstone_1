// apps/mobile/src/pages/SettingsPage.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native'; // Import useFocusEffect
import { get, post } from '../../lib/api'; // Make sure your API lib is imported

export default function SettingsPage({ navigation }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // useFocusEffect runs every time the screen comes into view
    useFocusEffect(
        React.useCallback(() => {
            async function fetchCurrentUser() {
                try {
                    setIsLoading(true);
                    const me = await get('/api/users/me'); // You need this endpoint to exist
                    setCurrentUser(me);
                } catch (error) {
                    console.error("Failed to fetch user data:", error);
                } finally {
                    setIsLoading(false);
                }
            }
            fetchCurrentUser();
        }, [])
    );

    async function handleLogout() {
        await SecureStore.deleteItemAsync('jwt');
        navigation.replace('Login');
    }

    async function handleApplyForOrganizer() {
        try {
            const response = await post('/api/users/apply-organizer', {});
            Alert.alert('Success', response.message);
            // Refresh user data to update the button state
            const me = await get('/api/users/me');
            setCurrentUser(me);
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    }
    
    const renderOrganizerButton = () => {
        if (isLoading) {
            return <ActivityIndicator size="small" color="#0000ff" />;
        }
        if (!currentUser) return null;

        if (currentUser.role === 'USER' && !currentUser.organizerRequestPending) {
            return (
                <TouchableOpacity
                    className="bg-blue-600 px-6 py-3 rounded-xl mt-8"
                    onPress={handleApplyForOrganizer}
                >
                    <Text className="text-white font-semibold text-center">Apply to be an Organizer</Text>
                </TouchableOpacity>
            );
        }

        if (currentUser.organizerRequestPending) {
             return <Text className="text-center text-gray-500 mt-8">Your application is pending review.</Text>;
        }
        
        if (currentUser.role === 'ORGANIZER') {
             return <Text className="text-center text-green-600 mt-8">You are an Organizer!</Text>;
        }

        return null; // Don't show for ADMINs
    };

    return (
        <View className="flex-1 bg-white px-6 py-8">
            <Text className="text-2xl font-bold mb-6">Settings</Text>

            {renderOrganizerButton()}

            <TouchableOpacity
                className="bg-red-600 px-6 py-3 rounded-xl mt-auto" // Use mt-auto to push to bottom
                onPress={handleLogout}
            >
                <Text className="text-white font-semibold text-center">Logout</Text>
            </TouchableOpacity>
        </View>
    );
}
