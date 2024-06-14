import Foundation

extension String {
    func suffix(after substring: String) -> String? {
        guard let range = self.range(of: substring) else {
            return nil
        }
        
        return String(self[range.upperBound...])
    }
}
