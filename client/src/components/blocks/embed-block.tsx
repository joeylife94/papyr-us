import { useState } from 'react';
import { ExternalLink, Youtube, Twitter, Github, Code, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface EmbedBlockProps {
  url: string;
  provider?: 'youtube' | 'figma' | 'miro' | 'loom' | 'twitter' | 'codepen' | 'github' | 'generic';
  title?: string;
  thumbnail?: string;
  aspectRatio?: string;
  onUrlChange?: (url: string) => void;
  onProviderChange?: (provider: EmbedBlockProps['provider']) => void;
  readOnly?: boolean;
  className?: string;
}

// Auto-detect provider from URL
function detectProvider(url: string): EmbedBlockProps['provider'] {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('figma.com')) return 'figma';
  if (url.includes('miro.com')) return 'miro';
  if (url.includes('loom.com')) return 'loom';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('codepen.io')) return 'codepen';
  if (url.includes('github.com')) return 'github';
  return 'generic';
}

// Convert URL to embeddable format
function getEmbedUrl(url: string, provider?: EmbedBlockProps['provider']): string {
  const detectedProvider = provider || detectProvider(url);

  switch (detectedProvider) {
    case 'youtube': {
      // Convert youtube.com/watch?v=ID or youtu.be/ID to youtube.com/embed/ID
      const videoId =
        url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1] ||
        url.match(/youtube\.com\/embed\/([^&\s]+)/)?.[1];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    }
    case 'figma': {
      // Figma embed URL
      if (url.includes('/embed')) return url;
      return url.replace('/file/', '/embed?embed_host=share&url=');
    }
    case 'loom': {
      // Loom share to embed
      const videoId = url.match(/loom\.com\/share\/([^&\s]+)/)?.[1];
      return videoId ? `https://www.loom.com/embed/${videoId}` : url;
    }
    case 'codepen': {
      // CodePen pen to embed
      return url.replace('/pen/', '/embed/');
    }
    default:
      return url;
  }
}

const PROVIDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  youtube: Youtube,
  twitter: Twitter,
  github: Github,
  codepen: Code,
  generic: FileText,
};

export function EmbedBlock({
  url,
  provider,
  title,
  aspectRatio = '16:9',
  onUrlChange,
  onProviderChange,
  readOnly = false,
  className = '',
}: EmbedBlockProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const detectedProvider = provider || detectProvider(url) || 'generic';
  const embedUrl = getEmbedUrl(url, detectedProvider);
  const IconComponent = (PROVIDER_ICONS[detectedProvider] as any) || ExternalLink;

  // Calculate aspect ratio padding
  const [width, height] = aspectRatio.split(':').map(Number);
  const paddingBottom = `${(height / width) * 100}%`;

  if (!url && !readOnly) {
    return (
      <div className={cn('border-2 border-dashed rounded-lg p-4', className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <ExternalLink className="h-5 w-5" />
          <span className="text-sm">Add an embed URL...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header with provider info */}
      {(title || detectedProvider !== 'generic') && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconComponent className="h-4 w-4" />
          <span>
            {title ||
              (detectedProvider
                ? detectedProvider.charAt(0).toUpperCase() + detectedProvider.slice(1)
                : 'Embed')}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}

      {/* Embed iframe */}
      <div
        className="relative w-full overflow-hidden rounded-lg border bg-muted/50"
        style={{ paddingBottom }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
        {hasError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <ExternalLink className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Failed to load embed</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              Open in new tab
            </a>
          </div>
        ) : (
          <iframe
            src={embedUrl}
            title={title || 'Embedded content'}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

// Embed editor with URL input and provider selection
interface EmbedEditorProps extends EmbedBlockProps {
  onAspectRatioChange?: (ratio: string) => void;
}

export function EmbedEditor({
  url,
  provider,
  title,
  aspectRatio = '16:9',
  onUrlChange,
  onProviderChange,
  onAspectRatioChange,
  className = '',
}: EmbedEditorProps) {
  const [localUrl, setLocalUrl] = useState(url);

  const handleUrlSubmit = () => {
    if (localUrl && localUrl !== url) {
      onUrlChange?.(localUrl);
      // Auto-detect provider
      const detected = detectProvider(localUrl);
      onProviderChange?.(detected);
    }
  };

  const providers: Array<EmbedBlockProps['provider']> = [
    'youtube',
    'figma',
    'miro',
    'loom',
    'twitter',
    'codepen',
    'github',
    'generic',
  ];

  const aspectRatios = ['16:9', '4:3', '1:1', '21:9'];

  return (
    <div className={cn('space-y-3', className)}>
      {/* URL Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Paste a link (YouTube, Figma, Miro, etc.)"
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
          className="flex-1"
        />
        <Button onClick={handleUrlSubmit} size="sm">
          Embed
        </Button>
      </div>

      {/* Options */}
      {url && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Provider:</span>
            <Select
              value={provider || detectProvider(url)}
              onValueChange={(value: any) => onProviderChange?.(value)}
            >
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p} value={p || 'generic'}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Ratio:</span>
            <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspectRatios.map((ratio) => (
                  <SelectItem key={ratio} value={ratio}>
                    {ratio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Preview */}
      {url && (
        <EmbedBlock
          url={url}
          provider={provider}
          title={title}
          aspectRatio={aspectRatio}
          readOnly
        />
      )}
    </div>
  );
}
