import { useState, createContext, useContext } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { deepOrange, grey } from "@mui/material/colors";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "react-query";
import Template from "./Template";
import Home from "./pages/Home";

const AppContext = createContext();

export const queryClient = new QueryClient();

export function useApp() {
	return useContext(AppContext);
}

const router = createBrowserRouter([
	{
		path: "/",
		element: <Template />,
		children: [
			{
				path: "/",
				element: <Home />,
			},
		],
	},
]);

export default function ThemedApp() {
    const [globalMsg, setGlobalMsg] = useState(null);
    const [clientId, setClientId] = useState("id" + Math.random().toString(16).slice(2));

    console.log('clientId', clientId)

    const theme = createTheme({
        palette: {
            mode: "light",
            primary: deepOrange,
            banner: grey[200],
            text: {
                fade: grey[500],
            },
        },
    });
    return (
		<ThemeProvider theme={theme}>
			<AppContext.Provider
				value={{
					globalMsg,
					setGlobalMsg,
                    clientId,
				}}>
				<QueryClientProvider client={queryClient}>
					<RouterProvider router={router} />
				</QueryClientProvider>
				<CssBaseline />
			</AppContext.Provider>
		</ThemeProvider>
	);
}