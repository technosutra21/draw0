
import { useRef, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { CanvasControls } from "./canvas/CanvasControls";
import { CanvasElement } from "./canvas/CanvasElement";
import { CanvasWelcome } from "./canvas/CanvasWelcome";
import { useCanvasEvents } from "@/hooks/useCanvasEvents";

interface CanvasProps {
  selectedTool: string;
  selectedPlant: any;
  selectedTerrain: any;
  onPlantUsed: () => void;
  onTerrainUsed: () => void;
  onToolChange: (tool: string) => void; // Add this to enable tool switching
}

interface DrawingElement {
  id: number;
  type: 'plant' | 'terrain' | 'rectangle' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  plant?: any;
  terrain?: any;
  selected?: boolean;
  rotation?: number;
  // Real-world size in meters (for terrain elements)
  realWorldWidth?: number;
  realWorldHeight?: number;
  // Terrain brush properties
  brushType?: 'rectangle' | 'circle' | 'path';
  texture?: string;
  // Path points for trail-like terrains
  pathPoints?: { x: number; y: number }[];
}

export const Canvas = ({ selectedTool, selectedPlant, selectedTerrain, onPlantUsed, onTerrainUsed, onToolChange }: CanvasProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [dragElement, setDragElement] = useState<DrawingElement | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [currentShape, setCurrentShape] = useState<DrawingElement | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [isDrawingTerrain, setIsDrawingTerrain] = useState(false);
  const [currentTerrainPath, setCurrentTerrainPath] = useState<{ x: number; y: number }[]>([]);

  // World-to-pixel conversion constants
  const PIXELS_PER_METER = 10;
  const GRID_SIZE_METERS = 2; // Each grid square = 2m x 2m
  const GRID_SIZE_PIXELS = GRID_SIZE_METERS * PIXELS_PER_METER;

  // Utility functions for world-to-pixel conversion
  const metersToPixels = useCallback((meters: number) => meters * PIXELS_PER_METER, []);
  const pixelsToMeters = useCallback((pixels: number) => pixels / PIXELS_PER_METER, []);
  
  // Parse terrain size string to get dimensions in meters
  const parseTerrainSize = useCallback((sizeString: string) => {
    if (sizeString === "Variável") {
      return { width: 1, height: 1 }; // Default 1x1m for variable size
    }
    
    const match = sizeString.match(/(\d+)x(\d+)m/);
    if (match) {
      return { width: parseInt(match[1]), height: parseInt(match[2]) };
    }
    
    // Handle single dimension (like "2x2m")
    const singleMatch = sizeString.match(/(\d+)m/);
    if (singleMatch) {
      const size = parseInt(singleMatch[1]);
      return { width: size, height: size };
    }
    
    // Default fallback
    return { width: 1, height: 1 };
  }, []);

  const { getMousePosition, snapToGrid, findElementAtPosition } = useCanvasEvents();

  const selectElement = useCallback((elementId: number) => {
    setElements(prev => prev.map(el => ({
      ...el,
      selected: el.id === elementId
    })));
  }, []);

  // Auto-select when clicking on any element
  const handleElementClick = useCallback((elementId: number) => {
    // Switch to select tool automatically
    if (selectedTool !== 'select') {
      onToolChange('select');
    }
    selectElement(elementId);
  }, [selectedTool, onToolChange, selectElement]);

  const clearSelection = useCallback(() => {
    setElements(prev => prev.map(el => ({ ...el, selected: false })));
  }, []);

  const copySelectedElements = useCallback(() => {
    const selectedElements = elements.filter(el => el.selected);
    if (selectedElements.length > 0) {
      const copiedElements = selectedElements.map(el => ({
        ...el,
        id: Date.now() + Math.random(),
        x: el.x + 50, // Offset copies slightly
        y: el.y + 50,
        selected: false
      }));
      setElements(prev => [...prev, ...copiedElements]);
      clearSelection();
      toast.success(`${selectedElements.length} elemento(s) copiado(s)`);
    } else {
      toast.error("Selecione elementos para copiar");
    }
  }, [elements, clearSelection]);

  const rotateSelectedElements = useCallback(() => {
    const selectedElements = elements.filter(el => el.selected);
    if (selectedElements.length > 0) {
      setElements(prev => prev.map(el => 
        el.selected 
          ? { ...el, rotation: (el.rotation || 0) + 90 }
          : el
      ));
      toast.success(`${selectedElements.length} elemento(s) rotacionado(s)`);
    } else {
      toast.error("Selecione elementos para rotacionar");
    }
  }, [elements]);

  const deleteSelectedElements = useCallback(() => {
    const selectedCount = elements.filter(el => el.selected).length;
    if (selectedCount > 0) {
      setElements(prev => prev.filter(el => !el.selected));
      toast.success(`${selectedCount} elemento(s) removido(s)`);
    }
  }, [elements]);

  const deleteElementAtPosition = useCallback((pos: { x: number; y: number }) => {
    const clickedElement = findElementAtPosition(pos, elements);
    if (clickedElement) {
      setElements(prev => prev.filter(el => el.id !== clickedElement.id));
      toast.success("Elemento removido");
      return true;
    }
    return false;
  }, [elements, findElementAtPosition]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rawPos = getMousePosition(e, canvasRef, zoom, panOffset);
    const pos = snapToGrid(rawPos, showGrid);
    
    // Handle panning with space key
    if (isSpacePressed) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    
    // Handle delete tool
    if (selectedTool === 'delete') {
      deleteElementAtPosition(pos);
      return;
    }

    // Check if clicking on an existing element for auto-selection
    const clickedElement = findElementAtPosition(pos, elements);
    
    if (clickedElement && selectedTool !== 'delete') {
      handleElementClick(clickedElement.id);
      setIsDragging(true);
      setDragElement(clickedElement);
      setDragOffset({
        x: pos.x - clickedElement.x,
        y: pos.y - clickedElement.y
      });
      return;
    }

    if (selectedTool === 'select' && clickedElement) {
      selectElement(clickedElement.id);
      setIsDragging(true);
      setDragElement(clickedElement);
      setDragOffset({
        x: pos.x - clickedElement.x,
        y: pos.y - clickedElement.y
      });
      return;
    }

    // Clear selection if clicking empty space with select tool
    if (selectedTool === 'select') {
      clearSelection();
      return;
    }

    // Add plant
    if (selectedPlant && (selectedTool === 'select' || !selectedTool)) {
      const newElement: DrawingElement = {
        id: Date.now(),
        type: 'plant',
        x: pos.x,
        y: pos.y,
        plant: selectedPlant,
      };
      
      setElements(prev => [...prev, newElement]);
      onPlantUsed();
      toast.success(`${selectedPlant.name} adicionada ao mapa!`);
      return;
    }

    // Add terrain element with brush system
    if (selectedTerrain && selectedTool === 'terrain') {
      const terrainSize = parseTerrainSize(selectedTerrain.size);
      const brushType = selectedTerrain.brushType || 'rectangle';
      
      if (brushType === 'path') {
        // For path terrain, create immediately as single click creates a simple path
        const pathLength = terrainSize.width > 1 ? terrainSize.width : 5; // Default path length
        const pathPoints = [
          pos,
          { x: pos.x + metersToPixels(pathLength), y: pos.y }
        ];
        
        const newTerrain: DrawingElement = {
          id: Date.now(),
          type: 'terrain',
          x: pos.x,
          y: pos.y,
          pathPoints: pathPoints,
          terrain: selectedTerrain,
          brushType: 'path',
          texture: selectedTerrain.texture,
          realWorldWidth: 1, // Path width
          realWorldHeight: pathLength,
        };
        
        setElements(prev => [...prev, newTerrain]);
        onTerrainUsed();
        toast.success(`${selectedTerrain.name} (caminho) adicionado ao mapa!`);
        return;
      } else {
        // Start drawing rectangle or circle terrain
        setIsDrawing(true);
        setStartPos(pos);
        
        const terrainWidthPixels = metersToPixels(terrainSize.width);
        const terrainHeightPixels = metersToPixels(terrainSize.height);
        
        const newTerrain: DrawingElement = {
          id: Date.now(),
          type: 'terrain',
          x: pos.x,
          y: pos.y,
          width: brushType === 'circle' ? 0 : terrainWidthPixels,
          height: brushType === 'circle' ? 0 : terrainHeightPixels,
          radius: brushType === 'circle' ? 0 : undefined,
          realWorldWidth: terrainSize.width,
          realWorldHeight: terrainSize.height,
          terrain: selectedTerrain,
          brushType: brushType,
          texture: selectedTerrain.texture,
        };
        
        setCurrentShape(newTerrain);
        return;
      }
    }

    // Start drawing shapes
    if (selectedTool === 'rectangle' || selectedTool === 'circle') {
      setIsDrawing(true);
      setStartPos(pos);
      
      const newShape: DrawingElement = {
        id: Date.now(),
        type: selectedTool as 'rectangle' | 'circle',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        radius: 0,
      };
      
      setCurrentShape(newShape);
    }
  }, [selectedTool, selectedPlant, selectedTerrain, elements, getMousePosition, snapToGrid, selectElement, clearSelection, onPlantUsed, onTerrainUsed, deleteElementAtPosition, findElementAtPosition, zoom, showGrid, isSpacePressed, panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rawPos = getMousePosition(e, canvasRef, zoom, panOffset);
    const pos = snapToGrid(rawPos, showGrid);

    // Handle panning
    if (isPanning) {
      const deltaX = e.clientX - lastPanPoint.x;
      const deltaY = e.clientY - lastPanPoint.y;
      setPanOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    // Handle dragging existing elements
    if (isDragging && dragElement) {
      const newPos = snapToGrid({
        x: pos.x - dragOffset.x,
        y: pos.y - dragOffset.y
      }, showGrid);
      
      setElements(prev => prev.map(el => 
        el.id === dragElement.id 
          ? { ...el, x: newPos.x, y: newPos.y }
          : el
      ));
      return;
    }

    // Handle drawing terrain paths (trails, streams)
    if (isDrawingTerrain && selectedTerrain) {
      setCurrentTerrainPath(prev => [...prev, pos]);
      return;
    }

    // Handle drawing new shapes (rectangles, circles, terrain areas)
    if (!isDrawing || !currentShape) return;

    const width = Math.abs(pos.x - startPos.x);
    const height = Math.abs(pos.y - startPos.y);
    
    if (currentShape.brushType === 'circle' || currentShape.type === 'circle') {
      const radius = Math.min(width, height) / 2;
      const updatedShape: DrawingElement = {
        ...currentShape,
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        radius: radius,
        width: radius * 2,
        height: radius * 2,
      };
      setCurrentShape(updatedShape);
    } else {
      const updatedShape: DrawingElement = {
        ...currentShape,
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        width: width,
        height: height,
      };
      setCurrentShape(updatedShape);
    }
  }, [isDragging, dragElement, dragOffset, isDrawing, currentShape, startPos, getMousePosition, snapToGrid, zoom, showGrid, isPanning, lastPanPoint, panOffset, isDrawingTerrain, selectedTerrain]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (isDragging) {
      setIsDragging(false);
      setDragElement(null);
      setDragOffset({ x: 0, y: 0 });
    }

    // Finish drawing terrain path
    if (isDrawingTerrain && currentTerrainPath.length > 1 && selectedTerrain) {
      const newTerrain: DrawingElement = {
        id: Date.now(),
        type: 'terrain',
        x: currentTerrainPath[0].x,
        y: currentTerrainPath[0].y,
        pathPoints: currentTerrainPath,
        terrain: selectedTerrain,
        brushType: 'path',
        texture: selectedTerrain.texture,
        realWorldWidth: 1, // Path width
        realWorldHeight: currentTerrainPath.length / 10, // Approximate length
      };
      
      setElements(prev => [...prev, newTerrain]);
      onTerrainUsed();
      setIsDrawingTerrain(false);
      setCurrentTerrainPath([]);
      toast.success(`${selectedTerrain.name} (trilha) adicionado ao mapa!`);
    }

    // Finish drawing terrain area
    if (isDrawing && currentShape) {
      const minSize = 10;
      const isValidSize = (currentShape.width && currentShape.width > minSize) || 
                         (currentShape.radius && currentShape.radius > minSize);
      
      if (isValidSize) {
        setElements(prev => [...prev, currentShape]);
        
        if (currentShape.type === 'terrain') {
          onTerrainUsed();
          const realArea = (currentShape.realWorldWidth || 1) * (currentShape.realWorldHeight || 1);
          toast.success(`${currentShape.terrain?.name} adicionado! (${realArea}m²)`);
        } else {
          toast.success(`${currentShape.type === 'rectangle' ? 'Retângulo' : 'Círculo'} criado!`);
        }
      }
      setCurrentShape(null);
    }
    
    setIsDrawing(false);
  }, [isDragging, isDrawing, currentShape, isPanning, isDrawingTerrain, currentTerrainPath, selectedTerrain, onTerrainUsed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    try {
      const plantData = JSON.parse(data);
      const rawPos = getMousePosition(e, canvasRef, zoom, panOffset);
      const pos = snapToGrid(rawPos, showGrid);
      
      const newElement: DrawingElement = {
        id: Date.now(),
        type: 'plant',
        x: pos.x,
        y: pos.y,
        plant: plantData,
      };
      
      setElements(prev => [...prev, newElement]);
      toast.success(`${plantData.name} adicionada via drag & drop!`);
    } catch (error) {
      console.error('Error parsing dropped data:', error);
    }
  }, [getMousePosition, snapToGrid, zoom, showGrid, panOffset]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Touch events for mobile pan/zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setIsPanning(true);
      const touch = e.touches[0];
      setLastPanPoint({ x: touch.clientX, y: touch.clientY });
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPanning) {
      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = touch.clientX - lastPanPoint.x;
      const deltaY = touch.clientY - lastPanPoint.y;
      setPanOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      setLastPanPoint({ x: touch.clientX, y: touch.clientY });
    }
  }, [isPanning, lastPanPoint]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      
      // Delete/Backspace - delete selected elements
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedElements();
      }
      
      // Escape - clear selection and cancel operations
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
        setCurrentShape(null);
        setIsDrawing(false);
        setIsDragging(false);
        setIsPanning(false);
        setIsDrawingTerrain(false);
        setCurrentTerrainPath([]);
        onToolChange('select'); // Switch to select tool
      }
      
      // G - toggle grid
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setShowGrid(prev => {
          const newState = !prev;
          toast.success(newState ? "Grade ativada" : "Grade desativada");
          return newState;
        });
      }
      
      // S - select tool
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        onToolChange('select');
        toast.info("Ferramenta Selecionar ativada");
      }
      
      // R - rectangle tool
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onToolChange('rectangle');
        toast.info("Ferramenta Retângulo ativada");
      }
      
      // C - circle tool or copy
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+C - copy
          copySelectedElements();
        } else {
          // C - circle tool
          onToolChange('circle');
          toast.info("Ferramenta Círculo ativada");
        }
      }
      
      // T - terrain tool
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        onToolChange('terrain');
        toast.info("Ferramenta Terreno ativada");
      }
      
      // D - delete tool
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        onToolChange('delete');
        toast.info("Ferramenta Excluir ativada");
      }
      
      // Ctrl+A - select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setElements(prev => prev.map(el => ({ ...el, selected: true })));
        toast.success("Todos os elementos selecionados");
      }
      
      // Ctrl+Z - undo (placeholder)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        toast.info("Desfazer - Em desenvolvimento");
      }
      
      // Ctrl+Y or Ctrl+Shift+Z - redo (placeholder)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        toast.info("Refazer - Em desenvolvimento");
      }
      
      // Number keys for zoom
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const zoomLevel = parseInt(e.key) * 25; // 1=25%, 2=50%, etc.
        setZoom(Math.min(zoomLevel, 300));
        toast.info(`Zoom: ${zoomLevel}%`);
      }
      
      // 0 - reset zoom
      if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setZoom(100);
        setPanOffset({ x: 0, y: 0 });
        toast.info("Zoom resetado para 100%");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [deleteSelectedElements, clearSelection, copySelectedElements, onToolChange]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 25, 300));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 25));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(100);
    setPanOffset({ x: 0, y: 0 });
    setElements([]);
    setCurrentShape(null);
    setIsDrawing(false);
    setIsDragging(false);
    setIsPanning(false);
    clearSelection();
    toast.success("Canvas resetado");
  }, [clearSelection]);

  const getCursorStyle = () => {
    if (isSpacePressed || isPanning) return 'cursor-grab';
    if (selectedTool === 'select') return 'cursor-default';
    if (selectedTool === 'delete') return 'cursor-pointer';
    if (selectedPlant || selectedTerrain) return 'cursor-copy';
    return 'cursor-crosshair';
  };

  return (
    <div className="h-full relative bg-card rounded-lg border border-border overflow-hidden transition-colors">
      <CanvasControls
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        showGrid={showGrid}
        onToggleGrid={() => {
          const newState = !showGrid;
          setShowGrid(newState);
          toast.success(newState ? "Grade ativada (G)" : "Grade desativada (G)");
        }}
        elementsCount={elements.length}
        selectedCount={elements.filter(el => el.selected).length}
      />

      {/* Canvas Area */}
      <div
        ref={canvasRef}
        className={`w-full h-full relative overflow-hidden ${getCursorStyle()} ${showGrid ? 'terrain-grid-pattern' : ''}`}
        style={{ 
          transform: `scale(${zoom / 100}) translate(${panOffset.x}px, ${panOffset.y}px)`, 
          transformOrigin: 'center',
          transition: isPanning ? 'none' : 'transform 0.2s ease'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-canvas="true"
      >
        {/* Grid Labels for Scale Reference - Fixed positioning */}
        {showGrid && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Horizontal scale labels - only on top */}
            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background/90 to-transparent">
              {Array.from({ length: Math.floor(1000 / GRID_SIZE_PIXELS) }, (_, i) => (
                <div
                  key={`h-${i}`}
                  className="absolute text-xs text-muted-foreground/80 bg-background/90 px-1 rounded-sm border border-border/30"
                  style={{
                    left: i * GRID_SIZE_PIXELS + 2,
                    top: 2,
                    fontSize: '9px',
                    fontWeight: '500'
                  }}
                >
                  {i * GRID_SIZE_METERS}m
                </div>
              ))}
            </div>
            
            {/* Vertical scale labels - only on left */}
            <div className="absolute top-0 left-0 bottom-0 w-8 bg-gradient-to-r from-background/90 to-transparent">
              {Array.from({ length: Math.floor(800 / GRID_SIZE_PIXELS) }, (_, i) => (
                <div
                  key={`v-${i}`}
                  className="absolute text-xs text-muted-foreground/80 bg-background/90 px-1 rounded-sm border border-border/30"
                  style={{
                    left: 2,
                    top: i * GRID_SIZE_PIXELS + 2,
                    fontSize: '9px',
                    fontWeight: '500',
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed'
                  }}
                >
                  {i * GRID_SIZE_METERS}m
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Render saved elements */}
        {elements.map(element => (
          <CanvasElement key={element.id} element={element} />
        ))}
        
        {/* Render current shape being drawn */}
        {currentShape && <CanvasElement element={currentShape} />}

        {/* Welcome Text for Empty Canvas */}
        {elements.length === 0 && !currentShape && <CanvasWelcome />}
      </div>
    </div>
  );
};
