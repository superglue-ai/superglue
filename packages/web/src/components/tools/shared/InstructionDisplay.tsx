import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { Check, Copy, Eye, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export const InstructionDisplay = ({ instruction, onEdit, showEditButton = true }: { instruction: string; onEdit?: () => void; showEditButton?: boolean; }) => {
    const [showFull, setShowFull] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isTruncated, setIsTruncated] = useState(false);
    const textRef = useRef<HTMLParagraphElement>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(instruction);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const normalizedText = instruction.replace(/\n/g, ' ');

    useEffect(() => {
        if (textRef.current) {
            const element = textRef.current;
            setIsTruncated(element.scrollHeight > element.clientHeight);
        }
    }, [normalizedText]);

    return (
        <>
            <div className="max-w-[75%]">
                <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="font-bold text-[13px]">Tool Instruction:</h3>
                    <div className="flex items-center gap-1">
                        {isTruncated && (
                            <Button variant="ghost" size="icon" className="h-[16px] w-[16px] p-0 mr-2" onClick={() => setShowFull(true)} title="View full instruction">
                                <Eye className="h-2.5 w-2.5" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-[16px] w-[16px] p-0" onClick={handleCopy} title="Copy instruction">
                            {copied ? <Check size={9} className="scale-[0.8]" /> : <Copy size={9} className="scale-[0.8]" />}
                        </Button>

                    </div>
                </div>
                <p
                    ref={textRef}
                    className="text-[13px] text-muted-foreground line-clamp-2"
                >
                    {normalizedText}
                </p>
            </div>
            {showFull && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowFull(false)}>
                    <Card className="max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 relative">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Tool Instruction</h3>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(instruction); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Copy">
                                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setShowFull(false)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                                <p className="text-sm font-mono whitespace-pre-wrap">{instruction}</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </>
    );
};
