import { X, RefreshCw } from "lucide-react";

interface ProfileSidebarProps {
	user: any;
	showProfile: boolean;
	setShowProfile: (show: boolean) => void;
	showToken: boolean;
	setShowToken: (show: boolean) => void;
	showRefreshToken: boolean;
	setShowRefreshToken: (show: boolean) => void;
	tokenStatus: string;
	browserInfo: { name: string; isFirefox: boolean; isChrome: boolean };
	handleManualRefresh: () => void;
	handleLogout: () => void;
	getTokenAge: () => string;
	getTokenExpiry: () => string;
}

export function ProfileSidebar({
	user,
	showProfile,
	setShowProfile,
	showToken,
	setShowToken,
	showRefreshToken,
	setShowRefreshToken,
	tokenStatus,
	browserInfo,
	handleManualRefresh,
	handleLogout,
	getTokenAge,
	getTokenExpiry,
}: ProfileSidebarProps) {
	if (!showProfile) return null;

	return (
		<div
			className="profile-sidebar"
			style={{
				position: "absolute",
				top: 0,
				right: 0,
				width: "340px",
				height: "100%",
				backgroundColor: "#1a1a1a",
				borderLeft: "1px solid #2a2a2a",
				zIndex: 1000,
				overflowY: "auto",
				boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
				color: "white",
			}}
		>
			<div style={{ padding: "12px 16px" }}>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: "16px",
					}}
				>
					<h3 style={{ margin: 0, color: "#fff", fontSize: "16px" }}>
						Profile
					</h3>
					<button
						onClick={() => setShowProfile(false)}
						style={{
							background: "none",
							border: "none",
							color: "#999",
							cursor: "pointer",
							padding: "4px",
							display: "flex",
							alignItems: "center",
						}}
					>
						<X size={20} />
					</button>
				</div>

				<div
					style={{
						textAlign: "center",
						marginBottom: "16px",
						padding: "12px",
						backgroundColor: "#0a0a0a",
						borderRadius: "12px",
					}}
				>
					<img
						src={user.picture}
						alt="profile"
						style={{
							width: "64px",
							height: "64px",
							borderRadius: "50%",
							border: "3px solid #4285f4",
							marginBottom: "8px",
						}}
					/>
					<h4 style={{ margin: "0 0 3px 0", color: "#fff" }}>{user.name}</h4>
					<p style={{ margin: 0, fontSize: "12px", color: "#999" }}>
						{user.email}
					</p>
				</div>

				<div style={{ marginBottom: "12px" }}>
					<ProfileDetail label="User ID" value={user.id} />
					<ProfileDetail
						label="Verified Email"
						value={user.verified_email ? "✅ Yes" : "❌ No"}
					/>
					<ProfileDetail label="Browser" value={browserInfo.name} />
					<ProfileDetail
						label="Login Time"
						value={new Date(user.loginTime).toLocaleString()}
					/>

					<details style={{ marginTop: "8px" }} open>
						<summary
							style={{
								cursor: "pointer",
								padding: "6px 10px",
								backgroundColor: "#0a0a0a",
								borderRadius: "6px",
								fontSize: "11px",
								color: "#999",
								userSelect: "none",
							}}
						>
							🔐 Advanced Details
						</summary>
						<div style={{ marginTop: "6px" }}>
							<ProfileDetail label="Picture URL" value={user.picture} />
							<ProfileDetail label="Redirect URI" value={user.redirectUri} />

							{user?.tokenTimestamp && (
								<>
									<ProfileDetail label="Token Age" value={getTokenAge()} />
									<ProfileDetail
										label="Token Expires In"
										value={getTokenExpiry()}
										valueColor={
											getTokenExpiry() === "Expired" ? "#dc2626" : "#fff"
										}
									/>
									{user?.refreshToken && (
										<ProfileDetail
											label="Has Refresh Token"
											value="✅ Yes (auto-refresh enabled)"
											valueColor="#4ade80"
										/>
									)}
								</>
							)}

							{user?.token && (
								<TokenDisplay
									label="Access Token"
									token={user.token}
									show={showToken}
									onToggle={() => setShowToken(!showToken)}
								/>
							)}

							{user?.refreshToken && (
								<TokenDisplay
									label="Refresh Token"
									token={user.refreshToken}
									show={showRefreshToken}
									onToggle={() => setShowRefreshToken(!showRefreshToken)}
									blur={44}
								/>
							)}
						</div>
					</details>
				</div>

				{user?.refreshToken && (
					<button
						onClick={handleManualRefresh}
						style={{
							width: "100%",
							padding: "10px",
							fontSize: "13px",
							cursor: "pointer",
							backgroundColor: "#4285f4",
							color: "white",
							border: "none",
							borderRadius: "8px",
							fontWeight: 600,
							transition: "all 0.3s",
							marginBottom: "10px",
						}}
					>
						🔄 Refresh Token Manually
					</button>
				)}

				<button
					onClick={handleLogout}
					style={{
						width: "100%",
						padding: "10px",
						fontSize: "13px",
						cursor: "pointer",
						backgroundColor: "#dc2626",
						color: "white",
						border: "none",
						borderRadius: "8px",
						fontWeight: 600,
						transition: "all 0.3s",
					}}
				>
					Logout
				</button>
			</div>
		</div>
	);
}

function ProfileDetail({
	label,
	value,
	valueColor = "#fff",
}: {
	label: string;
	value: string;
	valueColor?: string;
}) {
	return (
		<div
			style={{
				padding: "8px 10px",
				marginBottom: "6px",
				borderRadius: "8px",
				backgroundColor: "#0a0a0a",
				wordBreak: "break-word",
			}}
		>
			<div
				style={{
					fontSize: "10px",
					color: "#666",
					marginBottom: "3px",
				}}
			>
				{label}
			</div>
			<div style={{ fontSize: "11px", color: valueColor }}>{value}</div>
		</div>
	);
}

function TokenDisplay({
	label,
	token,
	show,
	onToggle,
	blur = 4,
}: {
	label: string;
	token: string;
	show: boolean;
	onToggle: () => void;
	blur?: number;
}) {
	return (
		<div
			style={{
				padding: "8px 10px",
				marginBottom: "6px",
				borderRadius: "8px",
				backgroundColor: "#0a0a0a",
				display: "flex",
				alignItems: "center",
				gap: "6px",
			}}
		>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						fontSize: "10px",
						color: "#666",
						marginBottom: "3px",
					}}
				>
					{label}
				</div>
				<div
					style={{
						fontSize: "11px",
						color: "#fff",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: show ? "normal" : "nowrap",
						filter: show ? "none" : `blur(${blur}px)`,
						wordBreak: "break-all",
					}}
				>
					{show
						? token
						: String(token).length > 48
						? String(token).substring(0, 48) + "..."
						: token}
				</div>
			</div>
			<button
				onClick={onToggle}
				style={{
					background: "none",
					border: "none",
					color: "#2196F3",
					cursor: "pointer",
					fontSize: "11px",
					padding: "4px 8px",
					whiteSpace: "nowrap",
					alignSelf: "flex-start",
				}}
			>
				{show ? "hide" : "show"}
			</button>
		</div>
	);
}
