import React, { useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { ActivityIndicator, Text, View } from "react-native";
import Icon from "react-native-vector-icons/Feather";

import HomePage from "../pages/HomePage";
import ProfilePage from "../pages/ProfilePage";
import CreateEventPage from "../pages/CreateEventPage";
import { get } from "../lib/api"; // ✅ import your API wrapper

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await get("/api/users/me"); // ✅ auto-includes token
        setUser(data);
      } catch (err) {
        console.error("❌ Failed to fetch user:", err);
        setUser(null); // fallback if unauthorized or error
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  const isOrganizer = user?.role === "ORGANIZER";

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2E7D32",
        tabBarInactiveTintColor: "#999",
        tabBarStyle: { height: 60, paddingBottom: 6 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Home: "home",
            Discover: "compass",
            Create: "plus-square",
            Notifications: "bell",
            Profile: "user",
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel: ({ focused, color }) => (
          <Text
            style={{
              fontSize: 12,
              fontWeight: focused ? "600" : "400",
              color,
            }}
          >
            {route.name}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomePage} />
      <Tab.Screen name="Discover" component={Dummy} />
      {isOrganizer && (
        <Tab.Screen name="Create" component={CreateEventPage} />
      )}
      <Tab.Screen name="Notifications" component={Dummy} />
      <Tab.Screen name="Profile" component={ProfilePage} />
    </Tab.Navigator>
  );
}

// Placeholder
function Dummy() {
  return null;
}
