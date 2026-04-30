import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface Project {
  id: string;
  name: string;
  description: string;
  files: ProjectFile[];
  createdAt: string;
  updatedAt: string;
  gitRepo?: string;
  gitProvider?: "github" | "gitlab";
  language?: string;
  combinedWith?: string[];
  checkpoints?: ProjectCheckpoint[];
  tasks?: ProjectTask[];
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isOpen?: boolean;
  isDirty?: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "gemini" | "deepseek" | "mistral" | "groq" | "openrouter" | "perplexity" | "xai" | "cortesia" | "custom";
  apiKey: string;
  baseUrl?: string;
  model?: string;
  isActive: boolean;
}

export interface GitConfig {
  provider: "github" | "gitlab";
  token: string;
  username: string;
  email?: string;
  instanceUrl?: string;
}

export interface DBConfig {
  provider: "neon" | "postgres" | "sqlite";
  connectionString: string;
  name: string;
}

export interface TerminalSession {
  id: string;
  name: string;
  history: TerminalLine[];
}

export interface TerminalLine {
  id: string;
  type: "input" | "output" | "error" | "info";
  content: string;
  timestamp: string;
}

export interface ProjectCheckpoint {
  id: string;
  label: string;
  createdAt: string;
  files: ProjectFile[];
}

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: "pendente" | "em_progresso" | "concluido";
  priority: "baixa" | "media" | "alta";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AIMemoryEntry {
  id: string;
  content: string;
  createdAt: string;
  category: "usuario" | "projeto" | "preferencia" | "geral";
}

export interface AppSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  theme: "dark" | "darker" | "monokai" | "dracula";
  showLineNumbers: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
  systemPrompt: string;
  customServerUrl: string;
  geminiDirectKey: string;
}

interface AppContextType {
  projects: Project[];
  activeProject: Project | null;
  activeFile: ProjectFile | null;
  aiProviders: AIProvider[];
  gitConfigs: GitConfig[];
  dbConfigs: DBConfig[];
  terminalSessions: TerminalSession[];
  activeTerminal: string | null;
  settings: AppSettings;
  aiMemory: AIMemoryEntry[];
  addMemoryEntry: (entry: Omit<AIMemoryEntry, "id" | "createdAt">) => void;
  removeMemoryEntry: (id: string) => void;
  clearMemory: () => void;
  setActiveProject: (project: Project | null) => void;
  setActiveFile: (file: ProjectFile | null) => void;
  createProject: (name: string, description?: string) => Project;
  deleteProject: (id: string) => void;
  updateProject: (id: string, data: Partial<Project>) => void;
  combineProjects: (projectIds: string[], newName: string) => Project;
  createFile: (projectId: string, name: string, content?: string) => ProjectFile;
  updateFile: (projectId: string, fileId: string, content: string) => void;
  deleteFile: (projectId: string, fileId: string) => void;
  renameFile: (projectId: string, fileId: string, newName: string) => void;
  addAIProvider: (provider: Omit<AIProvider, "id">) => void;
  updateAIProvider: (id: string, data: Partial<AIProvider>) => void;
  removeAIProvider: (id: string) => void;
  setActiveAIProvider: (id: string) => void;
  getActiveAIProvider: () => AIProvider | null;
  addGitConfig: (config: GitConfig) => void;
  updateGitConfig: (provider: string, data: Partial<GitConfig>) => void;
  removeGitConfig: (provider: string) => void;
  addDBConfig: (config: DBConfig) => void;
  removeDBConfig: (name: string) => void;
  addTerminalSession: (name?: string) => TerminalSession;
  removeTerminalSession: (id: string) => void;
  setActiveTerminal: (id: string | null) => void;
  addTerminalLine: (sessionId: string, line: Omit<TerminalLine, "id" | "timestamp">) => void;
  clearTerminal: (sessionId: string) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  importGitRepo: (url: string, token: string, provider: "github" | "gitlab") => Promise<Project>;
  pushToGit: (projectId: string, repoUrl: string, token: string, branch?: string) => Promise<{ pushed: number; errors: number }>;
  saveCheckpoint: (projectId: string, label?: string) => ProjectCheckpoint;
  restoreCheckpoint: (projectId: string, checkpointId: string) => void;
  deleteCheckpoint: (projectId: string, checkpointId: string) => void;
  addTask: (projectId: string, task: Omit<ProjectTask, "id" | "createdAt" | "updatedAt">) => ProjectTask;
  updateTask: (projectId: string, taskId: string, data: Partial<ProjectTask>) => void;
  deleteTask: (projectId: string, taskId: string) => void;
  reorderTasks: (projectId: string, tasks: ProjectTask[]) => void;
}

const defaultSettings: AppSettings = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  theme: "dark",
  showLineNumbers: true,
  autoSave: true,
  autoSaveInterval: 3000,
  systemPrompt: "",
  customServerUrl: "",
  geminiDirectKey: "",
};

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  PROJECTS: "@devmobile/projects",
  AI_PROVIDERS: "@devmobile/ai_providers",
  GIT_CONFIGS: "@devmobile/git_configs",
  DB_CONFIGS: "@devmobile/db_configs",
  SETTINGS: "@devmobile/settings",
  AI_MEMORY: "@devmobile/ai_memory",
  ACTIVE_PROJECT_ID: "@devmobile/active_project_id",
  ACTIVE_FILE_ID: "@devmobile/active_file_id",
};

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    dockerfile: "dockerfile",
    toml: "toml",
    xml: "xml",
    php: "php",
    vue: "vue",
    svelte: "svelte",
  };
  return map[ext || ""] || "plaintext";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [activeFile, setActiveFileState] = useState<ProjectFile | null>(null);
  const [aiProviders, setAIProviders] = useState<AIProvider[]>([]);
  const [gitConfigs, setGitConfigs] = useState<GitConfig[]>([]);
  const [dbConfigs, setDBConfigs] = useState<DBConfig[]>([]);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [activeTerminal, setActiveTerminalState] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [aiMemory, setAIMemory] = useState<AIMemoryEntry[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const safeGet = async <T,>(key: string): Promise<T | null> => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
      } catch { return null; }
    };

    const [p, ai, git, db, s, mem, savedProjectId, savedFileId] = await Promise.all([
      safeGet<Project[]>(STORAGE_KEYS.PROJECTS),
      safeGet<AIProvider[]>(STORAGE_KEYS.AI_PROVIDERS),
      safeGet<GitConfig[]>(STORAGE_KEYS.GIT_CONFIGS),
      safeGet<DBConfig[]>(STORAGE_KEYS.DB_CONFIGS),
      safeGet<AppSettings>(STORAGE_KEYS.SETTINGS),
      safeGet<AIMemoryEntry[]>(STORAGE_KEYS.AI_MEMORY),
      safeGet<string>(STORAGE_KEYS.ACTIVE_PROJECT_ID),
      safeGet<string>(STORAGE_KEYS.ACTIVE_FILE_ID),
    ]);

    if (p && Array.isArray(p)) {
      setProjects(p);
      // Restaura projeto e arquivo ativos da última sessão
      if (savedProjectId) {
        const savedProject = p.find((proj) => proj.id === savedProjectId);
        if (savedProject) {
          setActiveProjectState(savedProject);
          if (savedFileId) {
            const savedFile = savedProject.files.find((f) => f.id === savedFileId);
            if (savedFile) setActiveFileState(savedFile);
          }
        }
      }
    }

    const CORTESIA_DEFAULT: AIProvider = {
      id: "cortesia-default",
      name: "Gemini (Gratuito)",
      type: "cortesia",
      apiKey: "",
      isActive: true,
    };
    if (ai && Array.isArray(ai) && ai.length > 0) {
      // garante que o provedor cortesia sempre existe
      const hasCortesia = ai.some((p) => p.type === "cortesia");
      setAIProviders(hasCortesia ? ai : [CORTESIA_DEFAULT, ...ai]);
    } else {
      setAIProviders([CORTESIA_DEFAULT]);
    }

    if (git && Array.isArray(git)) setGitConfigs(git);
    if (db && Array.isArray(db)) setDBConfigs(db);
    if (s && typeof s === "object") setSettings({ ...defaultSettings, ...s });
    if (mem && Array.isArray(mem)) setAIMemory(mem);
  }

  async function save(key: string, data: unknown) {
    try {
      const serialized = JSON.stringify(data);
      // Se projetos ficarem grandes demais, salva versão resumida (sem conteúdo de arquivos enormes)
      if (key === STORAGE_KEYS.PROJECTS && serialized.length > 4_000_000) {
        const trimmed = (data as Project[]).map((proj) => ({
          ...proj,
          files: proj.files.map((f) => ({
            ...f,
            // Trunca arquivos maiores que 500KB no armazenamento
            content: f.content.length > 500_000
              ? f.content.slice(0, 500_000) + "\n\n// [ARQUIVO TRUNCADO — muito grande para salvar localmente]\n"
              : f.content,
          })),
        }));
        await AsyncStorage.setItem(key, JSON.stringify(trimmed));
      } else {
        await AsyncStorage.setItem(key, serialized);
      }
    } catch {
      // Falha silenciosa — mantém estado em memória mesmo sem salvar
    }
  }

  const setActiveProject = useCallback((project: Project | null) => {
    setActiveProjectState(project);
    setActiveFileState(null);
    if (project) {
      AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, project.id).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT_ID).catch(() => {});
    }
    AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_FILE_ID).catch(() => {});
  }, []);

  const setActiveFile = useCallback((file: ProjectFile | null) => {
    setActiveFileState(file);
    if (file) {
      AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_FILE_ID, file.id).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_FILE_ID).catch(() => {});
    }
  }, []);

  const createProject = useCallback(
    (name: string, description = ""): Project => {
      const project: Project = {
        id: generateId(),
        name,
        description,
        files: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setProjects((prev) => {
        const next = [...prev, project];
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      return project;
    },
    []
  );

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      save(STORAGE_KEYS.PROJECTS, next);
      return next;
    });
    setActiveProjectState((prev) => (prev?.id === id ? null : prev));
  }, []);

  const updateProject = useCallback((id: string, data: Partial<Project>) => {
    setProjects((prev) => {
      const next = prev.map((p) =>
        p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
      );
      save(STORAGE_KEYS.PROJECTS, next);
      return next;
    });
    setActiveProjectState((prev) =>
      prev?.id === id ? { ...prev, ...data, updatedAt: new Date().toISOString() } : prev
    );
  }, []);

  const combineProjects = useCallback(
    (projectIds: string[], newName: string): Project => {
      const toMerge = projects.filter((p) => projectIds.includes(p.id));
      const allFiles: ProjectFile[] = [];
      toMerge.forEach((p) => {
        p.files.forEach((f) => {
          allFiles.push({ ...f, id: generateId() });
        });
      });
      const combined: Project = {
        id: generateId(),
        name: newName,
        description: `Combined from: ${toMerge.map((p) => p.name).join(", ")}`,
        files: allFiles,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        combinedWith: projectIds,
      };
      setProjects((prev) => {
        const next = [...prev, combined];
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      return combined;
    },
    [projects]
  );

  const createFile = useCallback(
    (projectId: string, name: string, content = ""): ProjectFile => {
      const file: ProjectFile = {
        id: generateId(),
        name,
        path: name,
        content,
        language: detectLanguage(name),
      };
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId
            ? { ...p, files: [...p.files, file], updatedAt: new Date().toISOString() }
            : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      setActiveProjectState((prev) =>
        prev?.id === projectId
          ? { ...prev, files: [...prev.files, file], updatedAt: new Date().toISOString() }
          : prev
      );
      return file;
    },
    []
  );

  const updateFile = useCallback(
    (projectId: string, fileId: string, content: string) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                files: p.files.map((f) =>
                  f.id === fileId ? { ...f, content, isDirty: false } : f
                ),
                updatedAt: new Date().toISOString(),
              }
            : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      setActiveProjectState((prev) =>
        prev?.id === projectId
          ? {
              ...prev,
              files: prev.files.map((f) =>
                f.id === fileId ? { ...f, content, isDirty: false } : f
              ),
            }
          : prev
      );
      setActiveFileState((prev) =>
        prev?.id === fileId ? { ...prev, content, isDirty: false } : prev
      );
    },
    []
  );

  const deleteFile = useCallback((projectId: string, fileId: string) => {
    setProjects((prev) => {
      const next = prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              files: p.files.filter((f) => f.id !== fileId),
              updatedAt: new Date().toISOString(),
            }
          : p
      );
      save(STORAGE_KEYS.PROJECTS, next);
      return next;
    });
    setActiveProjectState((prev) =>
      prev?.id === projectId
        ? { ...prev, files: prev.files.filter((f) => f.id !== fileId) }
        : prev
    );
    setActiveFileState((prev) => (prev?.id === fileId ? null : prev));
  }, []);

  const renameFile = useCallback(
    (projectId: string, fileId: string, newName: string) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                files: p.files.map((f) =>
                  f.id === fileId
                    ? { ...f, name: newName, path: newName, language: detectLanguage(newName) }
                    : f
                ),
              }
            : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
    },
    []
  );

  const addAIProvider = useCallback((provider: Omit<AIProvider, "id">) => {
    const newP: AIProvider = { ...provider, id: generateId() };
    setAIProviders((prev) => {
      const next = [...prev, newP];
      save(STORAGE_KEYS.AI_PROVIDERS, next);
      return next;
    });
  }, []);

  const updateAIProvider = useCallback(
    (id: string, data: Partial<AIProvider>) => {
      setAIProviders((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, ...data } : p));
        save(STORAGE_KEYS.AI_PROVIDERS, next);
        return next;
      });
    },
    []
  );

  const removeAIProvider = useCallback((id: string) => {
    setAIProviders((prev) => {
      const next = prev.filter((p) => p.id !== id);
      save(STORAGE_KEYS.AI_PROVIDERS, next);
      return next;
    });
  }, []);

  const setActiveAIProvider = useCallback((id: string) => {
    setAIProviders((prev) => {
      const next = prev.map((p) => ({ ...p, isActive: p.id === id }));
      save(STORAGE_KEYS.AI_PROVIDERS, next);
      return next;
    });
  }, []);

  const getActiveAIProvider = useCallback((): AIProvider | null => {
    return aiProviders.find((p) => p.isActive) ?? null;
  }, [aiProviders]);

  const addGitConfig = useCallback((config: GitConfig) => {
    setGitConfigs((prev) => {
      const next = [...prev.filter((g) => g.provider !== config.provider), config];
      save(STORAGE_KEYS.GIT_CONFIGS, next);
      return next;
    });
  }, []);

  const updateGitConfig = useCallback(
    (provider: string, data: Partial<GitConfig>) => {
      setGitConfigs((prev) => {
        const next = prev.map((g) => (g.provider === provider ? { ...g, ...data } : g));
        save(STORAGE_KEYS.GIT_CONFIGS, next);
        return next;
      });
    },
    []
  );

  const removeGitConfig = useCallback((provider: string) => {
    setGitConfigs((prev) => {
      const next = prev.filter((g) => g.provider !== provider);
      save(STORAGE_KEYS.GIT_CONFIGS, next);
      return next;
    });
  }, []);

  const addDBConfig = useCallback((config: DBConfig) => {
    setDBConfigs((prev) => {
      const next = [...prev, config];
      save(STORAGE_KEYS.DB_CONFIGS, next);
      return next;
    });
  }, []);

  const removeDBConfig = useCallback((name: string) => {
    setDBConfigs((prev) => {
      const next = prev.filter((d) => d.name !== name);
      save(STORAGE_KEYS.DB_CONFIGS, next);
      return next;
    });
  }, []);

  const addTerminalSession = useCallback((name?: string): TerminalSession => {
    const session: TerminalSession = {
      id: generateId(),
      name: name || `Terminal ${Date.now()}`,
      history: [],
    };
    setTerminalSessions((prev) => [...prev, session]);
    setActiveTerminalState(session.id);
    return session;
  }, []);

  const removeTerminalSession = useCallback((id: string) => {
    setTerminalSessions((prev) => prev.filter((s) => s.id !== id));
    setActiveTerminalState((prev) => (prev === id ? null : prev));
  }, []);

  const setActiveTerminal = useCallback((id: string | null) => {
    setActiveTerminalState(id);
  }, []);

  const addTerminalLine = useCallback(
    (sessionId: string, line: Omit<TerminalLine, "id" | "timestamp">) => {
      const fullLine: TerminalLine = {
        ...line,
        id: generateId(),
        timestamp: new Date().toISOString(),
      };
      setTerminalSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, history: [...s.history, fullLine] }
            : s
        )
      );
    },
    []
  );

  const clearTerminal = useCallback((sessionId: string) => {
    setTerminalSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, history: [] } : s))
    );
  }, []);

  const updateSettings = useCallback((s: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...s };
      save(STORAGE_KEYS.SETTINGS, next);
      return next;
    });
  }, []);

  const importGitRepo = useCallback(
    async (url: string, token: string, provider: "github" | "gitlab"): Promise<Project> => {
      const clean = url.trim().replace(/\.git$/, "");
      const repoName = clean.split("/").pop() || "repo";
      let files: ProjectFile[] = [];

      try {
        if (provider === "github") {
          const match = clean.match(/github\.com\/([^/]+)\/([^/]+)/);
          if (match) {
            const [, owner, repo] = match;
            const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const treeRes = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
              { headers }
            );
            if (treeRes.ok) {
              const tree = await treeRes.json() as { tree?: { type: string; path: string; size?: number }[] };
              const blobs = (tree.tree || [])
                .filter((i) => i.type === "blob" && (i.size ?? 0) < 5_000_000)
                .slice(0, 300);
              for (const item of blobs) {
                try {
                  const fr = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}`,
                    { headers }
                  );
                  if (fr.ok) {
                    const data = await fr.json() as { content?: string };
                    const raw = (data.content || "").replace(/\n/g, "");
                    const content = decodeURIComponent(escape(atob(raw)));
                    const ext = item.path.split(".").pop() || "";
                    const langMap: Record<string, string> = {
                      js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
                      py: "python", html: "html", css: "css", json: "json", md: "markdown",
                      sh: "bash", yaml: "yaml", yml: "yaml", env: "plaintext", txt: "plaintext",
                    };
                    files.push({
                      id: generateId(),
                      name: item.path.split("/").pop() || item.path,
                      path: item.path,
                      content,
                      language: langMap[ext] || "plaintext",
                    });
                  }
                } catch {}
              }
            }
          }
        } else if (provider === "gitlab") {
          const match = clean.match(/gitlab\.com\/([^?#]+)/);
          if (match && token) {
            const projectPath = encodeURIComponent(match[1]);
            const headers: Record<string, string> = {
              "PRIVATE-TOKEN": token,
              "Content-Type": "application/json",
            };
            const treeRes = await fetch(
              `https://gitlab.com/api/v4/projects/${projectPath}/repository/tree?recursive=true&per_page=40`,
              { headers }
            );
            if (treeRes.ok) {
              const tree = await treeRes.json() as { type: string; path: string }[];
              const blobs = tree.filter((i) => i.type === "blob").slice(0, 40);
              for (const item of blobs) {
                try {
                  const fr = await fetch(
                    `https://gitlab.com/api/v4/projects/${projectPath}/repository/files/${encodeURIComponent(item.path)}/raw`,
                    { headers }
                  );
                  if (fr.ok) {
                    const content = await fr.text();
                    const ext = item.path.split(".").pop() || "";
                    files.push({
                      id: generateId(),
                      name: item.path.split("/").pop() || item.path,
                      path: item.path,
                      content,
                      language: ext || "plaintext",
                    });
                  }
                } catch {}
              }
            }
          }
        }
      } catch {}

      if (files.length === 0) {
        files = [
          {
            id: generateId(),
            name: "README.md",
            path: "README.md",
            content: `# ${repoName}\n\nRepositório importado de ${provider}.\n\nURL: ${url}\n\n> Arquivos não puderam ser baixados. Verifique o token e se o repositório é público.\n`,
            language: "markdown",
          },
          {
            id: generateId(),
            name: ".gitignore",
            path: ".gitignore",
            content: "node_modules/\n.env\n.DS_Store\ndist/\nbuild/\n",
            language: "plaintext",
          },
        ];
      }

      const project: Project = {
        id: generateId(),
        name: repoName,
        description: `Importado de ${provider}: ${url}`,
        files,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gitRepo: url,
        gitProvider: provider,
      };
      setProjects((prev) => {
        const next = [...prev, project];
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      return project;
    },
    []
  );

  const pushToGit = useCallback(
    async (projectId: string, repoUrl: string, token: string, branch = "main"): Promise<{ pushed: number; errors: number }> => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) throw new Error("Projeto não encontrado");

      const clean = repoUrl.trim().replace(/\.git$/, "");
      const isGitLab = clean.includes("gitlab.com");
      let pushed = 0;
      let errors = 0;

      if (!isGitLab) {
        // GitHub API
        const match = clean.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!match) throw new Error("URL do GitHub inválida");
        const [, owner, repo] = match;
        const base = `https://api.github.com/repos/${owner}/${repo}/contents`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        };
        for (const file of project.files) {
          const filePath = file.path || file.name;
          try {
            let sha: string | undefined;
            try {
              const r = await fetch(`${base}/${filePath}?ref=${branch}`, { headers });
              if (r.ok) {
                const d = await r.json() as { sha?: string };
                sha = d.sha;
              }
            } catch {}
            const encoded = btoa(unescape(encodeURIComponent(file.content)));
            const body: Record<string, unknown> = {
              message: `DevMobile: atualizar ${file.name}`,
              content: encoded,
              branch,
            };
            if (sha) body.sha = sha;
            const res = await fetch(`${base}/${filePath}`, {
              method: "PUT",
              headers,
              body: JSON.stringify(body),
            });
            if (res.ok) pushed++;
            else errors++;
          } catch {
            errors++;
          }
        }
      } else {
        // GitLab API
        const match = clean.match(/gitlab\.com\/([^?#]+)/);
        if (!match) throw new Error("URL do GitLab inválida");
        const projectPath = encodeURIComponent(match[1]);
        const base = `https://gitlab.com/api/v4/projects/${projectPath}/repository/files`;
        const headers: Record<string, string> = {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json",
        };
        for (const file of project.files) {
          const filePath = encodeURIComponent(file.path || file.name);
          try {
            // Check if exists
            const checkRes = await fetch(`${base}/${filePath}?ref=${branch}`, { headers });
            const method = checkRes.ok ? "PUT" : "POST";
            const res = await fetch(`${base}/${filePath}`, {
              method,
              headers,
              body: JSON.stringify({
                branch,
                content: file.content,
                commit_message: `DevMobile: atualizar ${file.name}`,
                encoding: "text",
              }),
            });
            if (res.ok) pushed++;
            else errors++;
          } catch {
            errors++;
          }
        }
      }

      // Update project gitRepo if not set
      if (!project.gitRepo) {
        setProjects((prev) => {
          const next = prev.map((p) =>
            p.id === projectId ? { ...p, gitRepo: repoUrl, updatedAt: new Date().toISOString() } : p
          );
          save(STORAGE_KEYS.PROJECTS, next);
          return next;
        });
      }

      return { pushed, errors };
    },
    [projects]
  );

  const saveCheckpoint = useCallback(
    (projectId: string, label?: string): ProjectCheckpoint => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) throw new Error("Projeto não encontrado");
      const checkpoint: ProjectCheckpoint = {
        id: generateId(),
        label: label || `Checkpoint ${new Date().toLocaleString("pt-BR")}`,
        createdAt: new Date().toISOString(),
        files: project.files.map((f) => ({ ...f })),
      };
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId
            ? { ...p, checkpoints: [...(p.checkpoints || []).slice(-9), checkpoint] }
            : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      return checkpoint;
    },
    [projects]
  );

  const restoreCheckpoint = useCallback(
    (projectId: string, checkpointId: string) => {
      setProjects((prev) => {
        const project = prev.find((p) => p.id === projectId);
        const checkpoint = project?.checkpoints?.find((c) => c.id === checkpointId);
        if (!project || !checkpoint) return prev;
        const next = prev.map((p) =>
          p.id === projectId
            ? { ...p, files: checkpoint.files.map((f) => ({ ...f })), updatedAt: new Date().toISOString() }
            : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      setActiveProjectState((prev) => {
        if (!prev || prev.id !== projectId) return prev;
        const checkpoint = prev.checkpoints?.find((c) => c.id === checkpointId);
        if (!checkpoint) return prev;
        return { ...prev, files: checkpoint.files.map((f) => ({ ...f })) };
      });
      setActiveFileState(null);
    },
    []
  );

  const deleteCheckpoint = useCallback(
    (projectId: string, checkpointId: string) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId
            ? { ...p, checkpoints: (p.checkpoints || []).filter((c) => c.id !== checkpointId) }
            : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
    },
    []
  );

  // ── TASKI — Task management ────────────────────────────────────────────
  const addTask = useCallback(
    (projectId: string, taskData: Omit<ProjectTask, "id" | "createdAt" | "updatedAt">): ProjectTask => {
      const task: ProjectTask = {
        ...taskData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId ? { ...p, tasks: [...(p.tasks || []), task] } : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      setActiveProjectState((prev) =>
        prev?.id === projectId ? { ...prev, tasks: [...(prev.tasks || []), task] } : prev
      );
      return task;
    },
    []
  );

  const updateTask = useCallback(
    (projectId: string, taskId: string, data: Partial<ProjectTask>) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                tasks: (p.tasks || []).map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        ...data,
                        updatedAt: new Date().toISOString(),
                        completedAt:
                          data.status === "concluido" && t.status !== "concluido"
                            ? new Date().toISOString()
                            : data.status !== "concluido"
                            ? undefined
                            : t.completedAt,
                      }
                    : t
                ),
              }
            : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      setActiveProjectState((prev) =>
        prev?.id === projectId
          ? {
              ...prev,
              tasks: (prev.tasks || []).map((t) =>
                t.id === taskId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
              ),
            }
          : prev
      );
    },
    []
  );

  const deleteTask = useCallback(
    (projectId: string, taskId: string) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId
            ? { ...p, tasks: (p.tasks || []).filter((t) => t.id !== taskId) }
            : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      setActiveProjectState((prev) =>
        prev?.id === projectId
          ? { ...prev, tasks: (prev.tasks || []).filter((t) => t.id !== taskId) }
          : prev
      );
    },
    []
  );

  const reorderTasks = useCallback(
    (projectId: string, newTasks: ProjectTask[]) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId ? { ...p, tasks: newTasks } : p
        );
        save(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      setActiveProjectState((prev) =>
        prev?.id === projectId ? { ...prev, tasks: newTasks } : prev
      );
    },
    []
  );

  const addMemoryEntry = useCallback(
    (entry: Omit<AIMemoryEntry, "id" | "createdAt">) => {
      setAIMemory((prev) => {
        const newEntry: AIMemoryEntry = {
          ...entry,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };
        const next = [...prev, newEntry].slice(-50);
        save(STORAGE_KEYS.AI_MEMORY, next);
        return next;
      });
    },
    []
  );

  const removeMemoryEntry = useCallback((id: string) => {
    setAIMemory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      save(STORAGE_KEYS.AI_MEMORY, next);
      return next;
    });
  }, []);

  const clearMemory = useCallback(() => {
    setAIMemory([]);
    save(STORAGE_KEYS.AI_MEMORY, []);
  }, []);

  return (
    <AppContext.Provider
      value={{
        projects,
        activeProject,
        activeFile,
        aiProviders,
        gitConfigs,
        dbConfigs,
        terminalSessions,
        activeTerminal,
        settings,
        aiMemory,
        addMemoryEntry,
        removeMemoryEntry,
        clearMemory,
        setActiveProject,
        setActiveFile,
        createProject,
        deleteProject,
        updateProject,
        combineProjects,
        createFile,
        updateFile,
        deleteFile,
        renameFile,
        addAIProvider,
        updateAIProvider,
        removeAIProvider,
        setActiveAIProvider,
        getActiveAIProvider,
        addGitConfig,
        updateGitConfig,
        removeGitConfig,
        addDBConfig,
        removeDBConfig,
        addTerminalSession,
        removeTerminalSession,
        setActiveTerminal,
        addTerminalLine,
        clearTerminal,
        updateSettings,
        importGitRepo,
        pushToGit,
        saveCheckpoint,
        restoreCheckpoint,
        deleteCheckpoint,
        addTask,
        updateTask,
        deleteTask,
        reorderTasks,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
