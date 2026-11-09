// Folder access that works in Chrome/Edge (read + write) and Firefox/Safari (read only, via a folder upload picker).
export const canWriteFolders = typeof window !== 'undefined' && 'showDirectoryPicker' in window

export interface PickedFolder {
  name: string
  files: File[] // top-level files only
  handle: FileSystemDirectoryHandle | null // null when the browser can't write back
}

export async function pickFolder(mode: 'read' | 'readwrite', id: string): Promise<PickedFolder> {
  if (canWriteFolders) {
    const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
    const handle = await picker({ mode, id })
    const files: File[] = []
    for await (const entry of (handle as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) {
      if (entry.kind === 'file') files.push(await (entry as FileSystemFileHandle).getFile())
    }
    return { name: handle.name, files, handle }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.style.display = 'none'
    document.body.appendChild(input)
    const abort = () => {
      input.remove()
      reject(Object.assign(new Error('No folder chosen'), { name: 'AbortError' }))
    }
    input.addEventListener('change', () => {
      const all = [...(input.files ?? [])]
      input.remove()
      if (!all.length) return abort()
      const top = all.filter((f) => (f.webkitRelativePath || f.name).split('/').length <= 2)
      resolve({ name: (all[0].webkitRelativePath || 'shoot').split('/')[0], files: top, handle: null })
    })
    input.addEventListener('cancel', abort)
    input.click()
  })
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
