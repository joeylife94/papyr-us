import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings, Plus, Edit, Trash2, Eye, EyeOff, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Directory, InsertDirectory } from "@shared/schema";

const directoryFormSchema = z.object({
  name: z.string().min(1, "Name is required").regex(/^[a-z0-9-_]+$/, "Name must be lowercase letters, numbers, hyphens, or underscores only"),
  displayName: z.string().min(1, "Display name is required"),
  password: z.string().optional(),
  isVisible: z.boolean().default(true),
  order: z.number().min(0).default(0),
});

type DirectoryFormData = z.infer<typeof directoryFormSchema>;

export default function AdminPage() {
  const [, navigate] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [editingDirectory, setEditingDirectory] = useState<Directory | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<DirectoryFormData>({
    resolver: zodResolver(directoryFormSchema),
    defaultValues: {
      name: "",
      displayName: "",
      password: "",
      isVisible: true,
      order: 0,
    },
  });

  // Check authentication on page load
  useEffect(() => {
    const stored = sessionStorage.getItem("adminAuth");
    if (stored) {
      // Verify stored password with server
      fetch("/papyr-us/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: stored }),
      }).then(response => {
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          sessionStorage.removeItem("adminAuth");
        }
      });
    }
  }, []);

  const handleAuth = async () => {
    try {
      const response = await fetch("/papyr-us/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: authPassword }),
      });

      if (response.ok) {
        setIsAuthenticated(true);
        sessionStorage.setItem("adminAuth", authPassword);
        toast({
          title: "Authentication successful",
          description: "Welcome to the admin panel",
        });
      } else {
        toast({
          title: "Authentication failed",
          description: "Invalid password",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to authenticate",
        variant: "destructive",
      });
    }
  };

  const { data: directories = [], refetch } = useQuery<Directory[]>({
            queryKey: ["/papyr-us/api/admin/directories"],
    queryFn: async () => {
      const storedPassword = sessionStorage.getItem("adminAuth") || "";
      const response = await fetch(`/api/admin/directories?adminPassword=${storedPassword}`);
      if (!response.ok) throw new Error("Failed to fetch directories");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const createDirectoryMutation = useMutation({
    mutationFn: async (data: InsertDirectory) => {
      const storedPassword = sessionStorage.getItem("adminAuth") || "";
              const response = await fetch("/papyr-us/api/admin/directories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, adminPassword: storedPassword }),
      });
      if (!response.ok) throw new Error("Failed to create directory");
      return response.json();
    },
    onSuccess: () => {
      refetch();
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Directory created",
        description: "New directory has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create directory",
        variant: "destructive",
      });
    },
  });

  const updateDirectoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Directory> }) => {
      const storedPassword = sessionStorage.getItem("adminAuth") || "";
      const response = await fetch(`/api/admin/directories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, adminPassword: storedPassword }),
      });
      if (!response.ok) throw new Error("Failed to update directory");
      return response.json();
    },
    onSuccess: () => {
      refetch();
      setEditingDirectory(null);
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Directory updated",
        description: "Directory has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update directory",
        variant: "destructive",
      });
    },
  });

  const deleteDirectoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const storedPassword = sessionStorage.getItem("adminAuth") || "";
      const response = await fetch(`/api/admin/directories/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: storedPassword }),
      });
      if (!response.ok) throw new Error("Failed to delete directory");
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Directory deleted",
        description: "Directory has been removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete directory",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: DirectoryFormData) => {
    if (editingDirectory) {
      updateDirectoryMutation.mutate({
        id: editingDirectory.id,
        data: {
          ...data,
          password: data.password || null,
        },
      });
    } else {
      createDirectoryMutation.mutate({
        ...data,
        password: data.password || undefined,
      });
    }
  };

  const handleEdit = (directory: Directory) => {
    setEditingDirectory(directory);
    form.reset({
      name: directory.name,
      displayName: directory.displayName,
      password: directory.password || "",
      isVisible: directory.isVisible,
      order: directory.order,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this directory?")) {
      deleteDirectoryMutation.mutate(id);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Admin Access</CardTitle>
            <p className="text-slate-600 dark:text-slate-400">
              Enter the admin password to continue
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Admin password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAuth()}
            />
            <Button onClick={handleAuth} className="w-full">
              Login
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/papyr-us/")}
              className="w-full"
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/papyr-us/")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Wiki
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center">
                <Settings className="h-8 w-8 mr-3 text-primary" />
                Admin Panel
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Manage directories and access permissions
              </p>
            </div>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingDirectory(null);
                  form.reset();
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Directory
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>
                  {editingDirectory ? "Edit Directory" : "Create Directory"}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Directory Name</FormLabel>
                        <FormControl>
                          <Input placeholder="docs, team1, etc." {...field} />
                        </FormControl>
                        <p className="text-xs text-slate-500">
                          Lowercase letters, numbers, hyphens, and underscores only
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Documentation, Team Alpha, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password (Optional)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Leave empty for no password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort Order</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="isVisible"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel>Visible in Sidebar</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingDirectory ? "Update" : "Create"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Directories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {directories.map((directory) => (
            <Card key={directory.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center">
                    {directory.isVisible ? (
                      <Eye className="h-4 w-4 mr-2 text-green-500" />
                    ) : (
                      <EyeOff className="h-4 w-4 mr-2 text-slate-400" />
                    )}
                    {directory.displayName}
                  </CardTitle>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(directory)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(directory.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Name:</span>
                  <Badge variant="outline">{directory.name}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Order:</span>
                  <span className="font-mono">{directory.order}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Protected:</span>
                  <Badge variant={directory.password ? "destructive" : "secondary"}>
                    {directory.password ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Status:</span>
                  <Badge variant={directory.isVisible ? "default" : "secondary"}>
                    {directory.isVisible ? "Visible" : "Hidden"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {directories.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <Settings className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No directories found
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Create your first directory to get started
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Directory
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}