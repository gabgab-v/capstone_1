import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomePage from "../pages/HomePage";
import { Text } from "react-native";
import Icon from "react-native-vector-icons/Feather";
import ProfilePage from "../pages/ProfilePage";

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
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
            Notifications: "bell",
            Profile: "user",
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel: ({ focused, color }) => (
          <Text className={`text-xs ${focused ? "font-semibold" : ""}`} style={{ color }}>
            {route.name}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomePage} />
      <Tab.Screen name="Discover" component={Dummy} />
      <Tab.Screen name="Notifications" component={Dummy} />
      <Tab.Screen name="Profile" component={ProfilePage} />
    </Tab.Navigator>
  );
}

// Placeholder
function Dummy() {
  return null;
}
