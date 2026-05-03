	const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
		e.stopPropagation(); 
		if (!confirm("Delete this thread permanently?")) return;

		try {
			await api.deleteSession(sessionId);
			setSessions((prev) => {
				const filtered = prev.filter((s) => s.id !== sessionId);
				if (sessionId === activeSessionId) {
					if (filtered.length > 0) {
						setActiveSessionId(filtered[0].id);
					} else {
						const fresh: Session = {
							id: Date.now().toString(),
							title: "New Chat",
							messages: [],
							updatedAt: new Date().toISOString(),
						};
						setActiveSessionId(fresh.id);
						return [fresh];
					}
				}
				return filtered;
			});
		} catch (err) {
			alert("Failed to delete thread from server");
		}
	};
