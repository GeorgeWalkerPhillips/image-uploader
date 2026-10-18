// Saves text as a file on the user's device via a temporary blob link. Lives in
// its own module so tests can mock it. On iPhone Safari the file may open in a
// viewer instead of saving; the person then chooses "Add All" from there.
export function downloadTextFile(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the browser has had time to start reading the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
