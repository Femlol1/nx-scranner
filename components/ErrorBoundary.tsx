"use client";

import { Component, ReactNode } from "react";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: any) {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="min-h-screen flex items-center justify-center p-6 bg-background">
					<div className="max-w-md w-full bg-panel rounded-lg shadow-lg p-6">
						<h2 className="text-xl font-semibold text-red-600 mb-3">
							Something went wrong
						</h2>
						<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
							The application encountered an unexpected error. Please try
							refreshing the page.
						</p>
						{this.state.error && (
							<details className="text-xs bg-muted p-3 rounded mb-4">
								<summary className="cursor-pointer font-medium mb-2">
									Error details
								</summary>
								<pre className="overflow-auto">
									{this.state.error.message}
									{"\n"}
									{this.state.error.stack}
								</pre>
							</details>
						)}
						<button
							onClick={() => window.location.reload()}
							className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
						>
							Reload Page
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
