// Proposta de juntas a partir de cada imagem real; revisão visual obrigatória.
import Foundation
import Vision
import AppKit
let args=CommandLine.arguments
let folder=URL(fileURLWithPath:args[1]);let output=URL(fileURLWithPath:args[2])
let names:[String:VNHumanBodyPoseObservation.JointName] = ["nariz":.nose,"orelha_E":.leftEar,"orelha_D":.rightEar,"ombro_E":.leftShoulder,"ombro_D":.rightShoulder,"pescoco":.neck,"cotovelo_E":.leftElbow,"cotovelo_D":.rightElbow,"punho_E":.leftWrist,"punho_D":.rightWrist,"quadril_E":.leftHip,"quadril_D":.rightHip,"quadril":.root,"joelho_E":.leftKnee,"joelho_D":.rightKnee,"tornozelo_E":.leftAnkle,"tornozelo_D":.rightAnkle]
let rect=CGRect(x:760,y:280,width:320,height:340)
var frames:[[String:Any]]=[]
for i in 1...39 {
 autoreleasepool {
  do {
   let url=folder.appendingPathComponent(String(format:"q%05d.jpg",i))
   let data=try Data(contentsOf:url);let image=NSImage(data:data)!
   let cg=image.cgImage(forProposedRect:nil,context:nil,hints:nil)!.cropping(to:rect)!
   let req=VNDetectHumanBodyPoseRequest();req.usesCPUOnly=true
   try VNImageRequestHandler(cgImage:cg,options:[:]).perform([req])
   var people:[[String:Any]]=[]
   for person in req.results ?? [] {
    var pts:[String:Any]=[:]
    for (key,name) in names {
     if let p=try? person.recognizedPoint(name) {
      pts[key]=["xy":[Double(rect.minX)+Double(p.x)*Double(rect.width),Double(rect.minY)+(1-Double(p.y))*Double(rect.height)],"confianca":Double(p.confidence)]
     }
    }
    people.append(pts)
   }
   frames.append(["quadro":i,"pessoas":people])
   print("VISION",i,people.count)
  } catch {frames.append(["quadro":i,"erro":error.localizedDescription]);print("ERROR",i,error)}
 }
}
try JSONSerialization.data(withJSONObject:frames,options:[.prettyPrinted,.sortedKeys]).write(to:output)
